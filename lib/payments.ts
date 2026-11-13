// ---------------------------------------------------------------------------
// The customer's fee: start a payment, find out whether it was paid, and act
// on it exactly once.
//
// THE RULE THIS FILE EXISTS TO KEEP: a request is paid when OZOW'S OWN RECORD
// says so, fetched by us from the status API. The browser landing on our
// return page proves nothing (anyone can type that URL), and a webhook is only
// a nudge to go and ask. Both paths end in reconcileRequest(), which asks.
//
// ONCE ONLY: the pending -> paid flip is a conditional update, and only the
// caller whose update actually changed a row sends the emails. The return
// page, the webhook and a duplicate webhook can all race; one of them wins.
// ---------------------------------------------------------------------------

import type { Payment, Prisma } from "@/lib/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getRequest } from "@/lib/store";
import { sendConsumerConfirmation, sendAdminNotification, sendUnknownInsurerNotification } from "@/lib/email";
import { logActivity, consumerActor, type ActivityActor } from "@/lib/activityLog";
import {
  ozowConfig,
  requestFee,
  createOzowPayment,
  listOzowTransactions,
  OzowError,
  type OzowConfig,
} from "@/lib/ozow";
import { discountedFee, voucherProblem } from "@/lib/vouchers";

/** How long an Ozow payment link stays usable. */
const LINK_LIFETIME_MS = 60 * 60 * 1000;

export type RequestPaymentState =
  /** Payments are off, or this request predates them / was a repairer's own. */
  | "not_required"
  | "unpaid"
  /** Ozow has it, the bank has not confirmed yet. Wait, never release. */
  | "pending"
  | "paid";

const SYSTEM: ActivityActor = { actorKind: "system", actorName: "Ozow" };

/** A statement reference from ours: PMP-20260925-SMITH-01 -> PMP2026092501. */
function beneficiaryRef(reference: string): string {
  const parts = reference.split("-");
  return parts.length >= 4 ? `PMP${parts[1]}${parts[parts.length - 1]}` : reference;
}

function money(v: Prisma.Decimal | number): number {
  return Math.round(Number(v) * 100) / 100;
}

/**
 * Ask Ozow what happened to every open attempt on this request, record it,
 * and report where the request stands. Safe to call as often as you like.
 */
export async function reconcileRequest(requestId: string): Promise<RequestPaymentState> {
  const db = getDb();
  const payments = await db.payment.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } });
  if (payments.length === 0) return "not_required";
  if (payments.some((p) => p.status === "paid")) return "paid";

  const cfg = ozowConfig();
  let pending = false;

  for (const p of payments) {
    // Never reached Ozow (the server stopped between making the row and opening
    // the link) and too old to be in progress: close it so its voucher use is freed.
    if (p.status === "pending" && !p.providerPaymentId && Date.now() > p.createdAt.getTime() + LINK_LIFETIME_MS) {
      const res = await db.payment.updateMany({
        where: { id: p.id, status: "pending" },
        data: { status: "failed", statusReason: "Payment link never opened" },
      });
      if (res.count === 1) await releaseVoucherUse(p);
      continue;
    }
    if (p.status !== "pending" || !p.providerPaymentId || !cfg) continue;
    // A payment row made against staging must never be checked against
    // production (Ozow would say it doesn't exist), and vice versa.
    if (p.isTest !== (cfg.env !== "production")) continue;

    const outcome = await checkOne(cfg, p);
    if (outcome === "paid") return "paid";
    if (outcome === "pending") pending = true;
  }
  return pending ? "pending" : "unpaid";
}

type Row = Payment;

async function checkOne(cfg: OzowConfig, p: Row): Promise<"paid" | "pending" | "open" | "failed"> {
  const db = getDb();
  const txns = await listOzowTransactions(cfg, p.providerPaymentId!, p.createdAt);
  const is = (t: { status: string }, s: string) => t.status?.toLowerCase() === s.toLowerCase();

  const ok = txns.find((t) => is(t, "Successful"));
  if (ok) {
    // Check what was actually paid against what we asked for, not merely that
    // something succeeded. A mismatch is never credited: a person looks at it.
    const paid = ok.amount ? money(ok.amount.value) : null;
    if (paid === null || paid !== money(p.amount) || (ok.amount?.currency ?? "ZAR").toUpperCase() !== p.currency) {
      await logActivity({
        action: "payment.amount_mismatch",
        summary: `Ozow reports ${ok.amount?.currency ?? "?"} ${paid ?? "?"} on a R${money(p.amount)} payment. NOT credited, check it by hand`,
        outcome: "failed",
        entityType: "payment",
        entityId: p.id,
        ...SYSTEM,
        detail: { providerPaymentId: p.providerPaymentId, transactionId: ok.id, reported: ok.amount },
      });
      return "pending";
    }
    await markPaid(p, ok.id, ok.completedDate);
    return "paid";
  }

  if (txns.some((t) => is(t, "Pending"))) return "pending";

  // Still open while the link is alive: the customer may be on Ozow's page
  // right now, or come back to a tab. Only a dead link is a failed attempt.
  const expired = Date.now() > p.createdAt.getTime() + LINK_LIFETIME_MS;
  const last = txns[txns.length - 1];
  if (expired || (last && is(last, "Error"))) {
    const reason = last?.reason || (expired ? "Link expired unpaid" : "Not completed");
    const res = await db.payment.updateMany({
      where: { id: p.id, status: "pending" },
      data: { status: "failed", statusReason: reason.slice(0, 500) },
    });
    if (res.count === 1) await releaseVoucherUse(p);
    if (res.count === 1 && last) {
      await logActivity({
        action: "payment.failed",
        summary: `Payment for request not completed: ${reason}`,
        outcome: "failed",
        entityType: "payment",
        entityId: p.id,
        ...SYSTEM,
        detail: { providerPaymentId: p.providerPaymentId, transactionId: last.id, reason },
      });
    }
    return "failed";
  }
  return "open";
}

async function markPaid(p: Row, transactionId: string, completedDate?: string) {
  const db = getDb();
  // The conditional update IS the lock: two callers can get here at once and
  // only one of them changes the row.
  const res = await db.payment.updateMany({
    where: { id: p.id, status: { not: "paid" } },
    data: {
      status: "paid",
      providerTransactionId: transactionId,
      paidAt: completedDate ? new Date(completedDate) : new Date(),
      statusReason: null,
    },
  });
  if (res.count !== 1) return;

  // The voucher use was held when this link opened. If the attempt was marked
  // failed (use given back) and then paid after all, the use happened: take it again.
  if (p.voucherId && p.status === "failed") {
    await db.voucher.update({ where: { id: p.voucherId }, data: { usesCount: { increment: 1 } } }).catch((err) => {
      console.error("voucher use re-count failed", p.voucherId, err);
    });
  }
  await announcePaid(p, transactionId);
}

/** Log it and send the emails. Only ever called by whoever flipped the row to paid. */
async function announcePaid(p: Row, transactionId: string) {
  const db = getDb();
  const row = await db.quoteRequest.findUnique({ where: { id: p.requestId }, select: { reference: true } });
  const req = row ? await getRequest(row.reference) : null;

  await logActivity({
    action: "payment.paid",
    summary: `${p.provider === "voucher" ? `Fee covered in full by voucher ${p.voucherCode}` : `R${money(p.amount)} received`}${p.isTest ? " (TEST, staging)" : ""} for ${req?.reference ?? "a request"}`,
    entityType: "request",
    entityId: req?.reference ?? p.requestId,
    entityLabel: req?.reference,
    ...(req ? consumerActor(`${req.firstName} ${req.lastName}`, req.email) : SYSTEM),
    detail: {
      paymentId: p.id,
      providerPaymentId: p.providerPaymentId,
      transactionId,
      amount: money(p.amount),
      isTest: p.isTest,
      ...(p.voucherCode ? { voucherCode: p.voucherCode, voucherPercentOff: p.voucherPercentOff } : {}),
    },
  });

  // Until now nobody was told about this request: an unpaid one is not work.
  // Best effort, like the submission emails always were.
  if (req) {
    try {
      await Promise.allSettled([
        sendConsumerConfirmation(req, []),
        sendAdminNotification(req, []),
        ...(req.insurerName && !req.insurerId ? [sendUnknownInsurerNotification(req)] : []),
      ]);
    } catch (err) {
      console.error("paid-request email failed", err);
    }
  }
}

export type StartResult =
  | { kind: "redirect"; url: string }
  | { kind: "paid" }
  /** Ozow is still confirming an earlier attempt: starting another risks paying twice. */
  | { kind: "pending" }
  | { kind: "off" }
  /** The voucher on the request stopped being valid since it was typed in. It has been taken off. */
  | { kind: "voucher_invalid"; reason: string }
  /** The pay page showed a different price from what it costs now. Show the new price first. */
  | { kind: "price_changed"; reason: string };

/** The newest Ozow link on this request that can still be paid, if any. */
async function liveLink(requestId: string, isTest: boolean) {
  const open = await getDb().payment.findFirst({
    where: { requestId, status: "pending", isTest, redirectUrl: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  return open && open.createdAt.getTime() + LINK_LIFETIME_MS > Date.now() ? open : null;
}

/** For the pay page: a payment link already open, so the price (and voucher) is fixed until it expires. */
export async function openPaymentLink(requestId: string): Promise<{ amount: number; expiresAt: Date } | null> {
  const cfg = ozowConfig();
  const open = cfg ? await liveLink(requestId, cfg.env !== "production") : null;
  return open ? { amount: money(open.amount), expiresAt: new Date(open.createdAt.getTime() + LINK_LIFETIME_MS) } : null;
}

/** A voucher's use is held from the moment a link opens; this gives it back when that attempt dies. */
async function releaseVoucherUse(p: { voucherId: string | null }) {
  if (!p.voucherId) return;
  await getDb()
    .voucher.updateMany({ where: { id: p.voucherId, usesCount: { gt: 0 } }, data: { usesCount: { decrement: 1 } } })
    .catch((err) => console.error("voucher use release failed", p.voucherId, err));
}

/**
 * Send the customer to pay.
 *
 * ONE LIVE PRICE PER REQUEST: while an Ozow link is still payable, Pay always
 * resumes THAT link, whatever voucher has been typed since (the voucher route
 * refuses changes meanwhile). Ozow gives us no way to cancel a link, so a
 * second link at another price could be paid as well: charged twice.
 *
 * A voucher's use is HELD when its link opens (a conditional update, so a
 * single-use code can't go to two people) and given back if that attempt fails
 * or expires (checkOne, the daily sweep in /api/cron/payments-sweep).
 *
 * @param siteUrl where Ozow sends them back to, e.g. https://www.pricemyprang.co.za
 * @param expectedAmount the price the pay page showed. If it no longer holds,
 *   nothing is opened and the customer sees the new price first.
 */
export async function startPayment(requestId: string, siteUrl: string, expectedAmount?: number): Promise<StartResult> {
  const cfg = ozowConfig();
  if (!cfg) return { kind: "off" };
  const db = getDb();
  const isTest = cfg.env !== "production";

  const req = await db.quoteRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, reference: true, publicToken: true, firstName: true, lastName: true, email: true, repairerInitiated: true,
      voucher: true,
    },
  });
  if (!req || !req.publicToken || req.repairerInitiated) return { kind: "off" };

  const state = await reconcileRequest(requestId);
  if (state === "paid") return { kind: "paid" };
  if (state === "pending") return { kind: "pending" };

  const live = await liveLink(requestId, isTest);
  if (live) return { kind: "redirect", url: live.redirectUrl! };

  // The price is worked out HERE, from the voucher as it stands now.
  let voucher = req.voucher;
  let dropped: string | null = null;
  if (voucher) {
    dropped = voucherProblem(voucher);
    if (dropped) {
      await db.quoteRequest.update({ where: { id: requestId }, data: { voucherId: null } });
      voucher = null;
    }
  }
  const amount = voucher ? discountedFee(requestFee(), voucher.percentOff) : requestFee();
  if (expectedAmount !== undefined && money(expectedAmount) !== amount)
    return { kind: "price_changed", reason: dropped ?? "The price has changed since this page loaded." };
  // From the quote form (no price shown yet): say so rather than quietly charging full price.
  if (dropped && expectedAmount === undefined) return { kind: "voucher_invalid", reason: dropped };

  const free = !!voucher && amount <= 0;
  const base = {
    requestId,
    amount,
    currency: "ZAR",
    isTest,
    ...(voucher ? { voucherId: voucher.id, voucherCode: voucher.code, voucherPercentOff: voucher.percentOff } : {}),
    ...(free ? { provider: "voucher", status: "paid" as const, providerTransactionId: `voucher:${voucher!.code}`, paidAt: new Date() } : {}),
  };

  // Hold the voucher use and make the payment row together, or neither.
  const row = await db.$transaction(async (tx) => {
    if (voucher) {
      const held = await tx.voucher.updateMany({
        where: { id: voucher.id, active: true, expiresAt: { gte: new Date() }, usesCount: { lt: tx.voucher.fields.maxUses } },
        data: { usesCount: { increment: 1 } },
      });
      if (held.count !== 1) return null;
    }
    return tx.payment.create({ data: base });
  });
  if (!row) {
    await db.quoteRequest.update({ where: { id: requestId }, data: { voucherId: null } });
    const reason = "That voucher has just been used up.";
    return expectedAmount === undefined ? { kind: "voucher_invalid", reason } : { kind: "price_changed", reason };
  }

  // 100% off: nothing to collect, no Ozow. The row was created paid, so this
  // caller is the one that announces it.
  if (free) {
    await announcePaid(row, row.providerTransactionId!);
    return { kind: "paid" };
  }

  try {
    const created = await createOzowPayment(cfg, {
      amount,
      merchantReference: req.reference,
      beneficiaryReference: beneficiaryRef(req.reference),
      returnUrl: `${siteUrl}/pay/${req.publicToken}`,
      expireAt: new Date(row.createdAt.getTime() + LINK_LIFETIME_MS),
      payer: {
        id: req.reference.slice(0, 50),
        name: `${req.firstName} ${req.lastName}`.slice(0, 200),
        ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.email) ? { email: req.email } : {}),
      },
      idempotencyKey: row.id,
    });
    if (!created.redirectUrl) throw new OzowError(500, "NoRedirect", `payment ${created.id} is ${created.status} with no redirectUrl`);

    await db.payment.update({
      where: { id: row.id },
      data: { providerPaymentId: created.id, redirectUrl: created.redirectUrl },
    });
    await logActivity({
      action: "payment.start",
      summary: `${req.firstName} ${req.lastName} sent to Ozow to pay R${amount}${isTest ? " (TEST, staging)" : ""} for ${req.reference}`,
      entityType: "request",
      entityId: req.reference,
      entityLabel: req.reference,
      ...consumerActor(`${req.firstName} ${req.lastName}`, req.email),
      detail: { paymentId: row.id, providerPaymentId: created.id, amount, env: cfg.env, voucherCode: row.voucherCode },
    });
    return { kind: "redirect", url: created.redirectUrl };
  } catch (err) {
    const e = err as OzowError;
    await db.payment.update({
      where: { id: row.id },
      data: { status: "failed", statusReason: `Could not open payment: ${e.message}`.slice(0, 500) },
    });
    await releaseVoucherUse(row);
    await logActivity({
      action: "payment.start_failed",
      summary: `Ozow refused to open a payment for ${req.reference}: ${e.message}`,
      outcome: "failed",
      entityType: "request",
      entityId: req.reference,
      entityLabel: req.reference,
      ...SYSTEM,
      detail: { paymentId: row.id, status: e.status, ozowError: e.code, ozowDetail: e.detail, correlationId: e.correlationId, env: cfg.env },
    });
    throw err;
  }
}

/**
 * Reconcile every attempt still open. For a webhook that doesn't say which
 * payment it is about, and for anything that fell between the cracks.
 */
export async function reconcileOpenPayments(maxAgeDays = 3): Promise<number> {
  const since = new Date(Date.now() - maxAgeDays * 86_400_000);
  const open = await getDb().payment.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    select: { requestId: true },
    distinct: ["requestId"],
    take: 100,
  });
  for (const o of open) await reconcileRequest(o.requestId);
  return open.length;
}

/** Where to send people back to: the configured site, else wherever they came from. */
export function siteUrlFor(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}
