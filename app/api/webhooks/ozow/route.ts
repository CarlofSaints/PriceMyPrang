import { NextResponse } from "next/server";
import { verifySvix } from "@/lib/svix";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { reconcileRequest, reconcileOpenPayments, siteUrlFor } from "@/lib/payments";
import { ozowConfig, webhookSecret, OzowError } from "@/lib/ozow";

// node:crypto, and a raw request body: neither survives the edge runtime.
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Ozow One API webhook (transaction.complete), delivered by Svix.
//
// NOTHING IN THE BODY IS BELIEVED. A verified delivery only tells us WHICH
// request to go and ask Ozow about; reconcileRequest() then reads the outcome
// and the amount from Ozow's status API itself. So a delivery we can't map
// (a "thin" one carries only a transaction id) still works: it just rechecks
// every open payment, of which there are only ever a handful.
//
// Set it up in Ozow Dashboard > One API Clients > (client) > Webhooks:
//   URL      https://www.pricemyprang.co.za/api/webhooks/ozow
//   Event    transaction.complete
//   Message  full   (carries TransactionReference = our request reference)
// The dashboard never shows the webhook's secret, so we fetch it from Ozow's
// API (webhookSecret). OZOW_WEBHOOK_SECRET, if set, overrides that.
// ---------------------------------------------------------------------------

let lastRefetch = 0;
let fetchBlockedUntil = 0;

export async function POST(request: Request) {
  const raw = await request.text();
  const fixed = process.env.OZOW_WEBHOOK_SECRET?.trim();
  const cfg = ozowConfig();
  const endpoint = `${siteUrlFor(request)}/api/webhooks/ozow`;

  // Only something shaped like a live Svix delivery may cost us a call to
  // Ozow. Junk posted at this public URL is refused without one.
  const ts = Number(request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp"));
  const signed =
    !!(request.headers.get("svix-id") ?? request.headers.get("webhook-id")) &&
    !!(request.headers.get("svix-signature") ?? request.headers.get("webhook-signature")) &&
    Number.isFinite(ts) &&
    Math.abs(Date.now() / 1000 - ts) <= 300;

  // Fail closed: without a secret nothing can be verified, so nothing is acted
  // on. 503 rather than 4xx so Svix keeps retrying until we can.
  let secret = fixed;
  if (!secret && cfg && signed) {
    // A failed fetch is remembered for a minute, so a broken setup can't turn
    // every post into Ozow API calls and a log row.
    if (Date.now() < fetchBlockedUntil) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    try {
      secret = await webhookSecret(cfg, endpoint);
    } catch (err) {
      fetchBlockedUntil = Date.now() + 60_000;
      await logActivity({
        action: "payment.webhook_rejected",
        summary: "Ozow webhook arrived but its secret couldn't be fetched from Ozow, so it was ignored",
        outcome: "failed",
        actorKind: "system",
        actorName: "Ozow",
        detail: { error: err instanceof OzowError ? err.message : String(err) },
        request,
      });
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
  }
  if (!secret && signed) {
    await logActivity({
      action: "payment.webhook_rejected",
      summary: "Ozow webhook arrived but Ozow isn't configured, so it was ignored",
      outcome: "failed",
      actorKind: "system",
      actorName: "Ozow",
      request,
    });
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let verified = !!secret && verifySvix(raw, request.headers, secret);
  // A fetched secret may be stale (rotated in Ozow): refetch and retry. Only
  // when the signature itself is what failed, and at most every five minutes.
  if (!verified && signed && secret && !fixed && cfg && Date.now() - lastRefetch > 5 * 60_000) {
    lastRefetch = Date.now();
    const again = await webhookSecret(cfg, endpoint, true).catch(() => null);
    if (again && again !== secret) verified = verifySvix(raw, request.headers, again);
  }

  if (!verified) {
    // Logged, never silently dropped: a bad signature is either our bug or
    // somebody probing the endpoint, and both want a person to look.
    await logActivity({
      action: "payment.webhook_rejected",
      summary: "Ozow webhook with a bad or stale signature was refused",
      outcome: "failed",
      actorKind: "system",
      actorName: "Ozow",
      detail: { svixId: request.headers.get("svix-id"), bytes: raw.length },
      request,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (event.type !== "transaction.complete") return NextResponse.json({ ok: true, ignored: event.type });

  // "full" deliveries name our reference; "thin" ones don't.
  const ref = typeof event.data?.TransactionReference === "string" ? event.data.TransactionReference : null;
  const row = ref
    ? await getDb().quoteRequest.findUnique({ where: { reference: ref }, select: { id: true } })
    : null;

  // Any failure here returns 500 so Svix retries. Reconciling is idempotent,
  // so a retry can never credit twice.
  try {
    if (row) await reconcileRequest(row.id);
    else await reconcileOpenPayments();
  } catch (err) {
    console.error("ozow webhook reconcile failed", err);
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
