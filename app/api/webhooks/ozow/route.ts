import { NextResponse } from "next/server";
import { verifySvix } from "@/lib/svix";
import { getDb } from "@/lib/db";
import { logActivity } from "@/lib/activityLog";
import { reconcileRequest, reconcileOpenPayments } from "@/lib/payments";

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
// then put its whsec_ secret in OZOW_WEBHOOK_SECRET.
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const secret = process.env.OZOW_WEBHOOK_SECRET?.trim();
  const raw = await request.text();

  // Fail closed: without a secret nothing can be verified, so nothing is acted on.
  if (!secret) {
    await logActivity({
      action: "payment.webhook_rejected",
      summary: "Ozow webhook arrived but OZOW_WEBHOOK_SECRET is not set, so it was ignored",
      outcome: "failed",
      actorKind: "system",
      actorName: "Ozow",
      request,
    });
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (!verifySvix(raw, request.headers, secret)) {
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
