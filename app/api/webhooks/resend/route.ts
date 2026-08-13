import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { findUserByEmail } from "@/lib/store";
import { logActivity } from "@/lib/activityLog";

// node:crypto, and a raw request body — neither survives the edge runtime.
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// What Resend did with a message after we handed it over.
//
// WHY THIS EXISTS. Until now the strongest thing this app could say about any
// email was "Resend accepted it" — which is what it said about all three
// messages to Mac-Rites that nobody ever received. Acceptance is not delivery.
// A bounce, a spam complaint or a silent quarantine left no trace anywhere,
// so "did she get it?" was unanswerable by anything except asking her.
//
// Every event lands in the activity log under the "email" area, keyed to the
// recipient's user record where there is one, so a workshop's whole mail
// history reads back on the same page as everything else they did.
// ---------------------------------------------------------------------------

/**
 * Resend signs webhooks with Svix. Verified by hand rather than pulling in the
 * `svix` package: it is one HMAC, and a dependency added for twenty lines is a
 * dependency to keep patched forever.
 */
function verify(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  // Refuse anything older than five minutes, so a signed request captured off
  // the wire can't be replayed indefinitely.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  // "whsec_" prefix is a label, not part of the key.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header carries a space-separated list of versioned signatures, because
  // a secret being rotated means two are briefly valid at once.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

/**
 * Which events are worth a row, and how each should be filed.
 *
 * `email.sent` and `email.delivery_delayed` are recorded because "we handed it
 * over and then nothing" is exactly the story that needed telling. Opens and
 * clicks are NOT: they fire repeatedly, they are wrong as often as they're
 * right once a mail client prefetches images, and they would bury the events
 * that mean something — the same reasoning that keeps successful media reads
 * out of the log.
 */
const HANDLED: Record<string, { outcome: "success" | "failed"; verb: string }> = {
  "email.sent": { outcome: "success", verb: "was accepted for delivery" },
  "email.delivered": { outcome: "success", verb: "was DELIVERED" },
  "email.delivery_delayed": { outcome: "failed", verb: "is DELAYED — not delivered yet" },
  "email.bounced": { outcome: "failed", verb: "BOUNCED" },
  "email.complained": { outcome: "failed", verb: "was marked as SPAM by the recipient" },
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // 503, not 200: an unconfigured endpoint that answers "fine" would let
    // Resend drop events we asked for and never know they were being thrown
    // away. A 503 makes it retry, and shows up in Resend's own dashboard.
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Must be read as raw text — the signature covers the exact bytes, so
  // parsing and re-serialising would break it.
  const raw = await request.text();
  if (!verify(raw, request.headers, secret))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const handled = event.type ? HANDLED[event.type] : undefined;
  // 200 on purpose for anything we don't record — an open or a click is a
  // perfectly valid event, and a non-2xx would make Svix retry it forever.
  if (!handled) return NextResponse.json({ ok: true, ignored: event.type ?? null });

  const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  const recipient = to?.trim().toLowerCase();

  // Tie the row to the person where we can, so the workshop filter on the
  // activity page picks these up alongside their sign-ins and quotes. A
  // recipient with no login (a consumer, an insurer) simply has none.
  const user = recipient ? await findUserByEmail(recipient) : null;

  await logActivity({
    action: event.type!,
    summary:
      `Email to ${recipient ?? "an unknown address"} ${handled.verb}` +
      (event.data?.subject ? ` — “${event.data.subject}”` : ""),
    outcome: handled.outcome,
    entityType: user ? "user" : null,
    entityId: user?.id ?? null,
    entityLabel: user?.name ?? recipient ?? null,
    actorKind: "system",
    actorName: "Resend",
    panelBeaterId: user?.panelBeaterId ?? null,
    detail: {
      to: recipient,
      subject: event.data?.subject,
      // Resend's own id for the message, so a row here can be matched against
      // its dashboard without guessing from timestamps.
      emailId: event.data?.email_id,
      bounceType: event.data?.bounce?.type,
      bounceSubType: event.data?.bounce?.subType,
      bounceMessage: event.data?.bounce?.message,
    },
    request,
  });

  return NextResponse.json({ ok: true });
}
