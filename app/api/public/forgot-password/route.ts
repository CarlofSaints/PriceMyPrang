import { NextResponse } from "next/server";
import { findUserByEmail, createPasswordSetToken } from "@/lib/store";
import { sendUserCredentials, passwordSetUrl } from "@/lib/email";
import { logActivity } from "@/lib/activityLog";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

/**
 * "I've forgotten my password."
 *
 * WHY THIS EXISTS: without it, every forgotten password is a phone call to
 * Price my Prang, and the set-password links that replaced emailed passwords
 * expire — so an unattended expiry used to mean an admin had to intervene.
 * Nobody should have to be that admin.
 *
 * THE RESPONSE IS IDENTICAL WHATEVER HAPPENS. Unknown address, disabled
 * account, mail refused by Resend — all answer the same 200. Anything else
 * turns this into a "does this person have an account?" oracle, on an endpoint
 * anyone on the internet can reach. What actually happened goes to the
 * activity log, which only staff can read.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);

  const b = (await request.json().catch(() => ({}))) as { email?: string };
  const email = b.email?.trim().toLowerCase();

  // Two limits, because they stop different things. Per-IP stops someone
  // walking a list of addresses to see which ones exist; per-address stops
  // one inbox being buried under reset mail by a stranger.
  const perIp = rateLimit(`forgot:${ip}`, 10, 3600_000);
  if (!perIp.ok)
    return tooManyRequests(perIp.retryAfter, "Too many attempts. Try again a bit later.");
  if (email) {
    const perEmail = rateLimit(`forgot-email:${email}`, 4, 3600_000);
    if (!perEmail.ok)
      return tooManyRequests(
        perEmail.retryAfter,
        "We've already sent a few of these. Check your inbox and spam folder."
      );
  }

  // The one thing worth its own answer: an empty box is a mistake, not a
  // secret, and telling them so gives nothing away.
  if (!email) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

  const ok = NextResponse.json({ ok: true });

  const user = await findUserByEmail(email);

  if (!user || !user.active) {
    await logActivity({
      action: "auth.password.forgot",
      summary: `Password reset asked for ${email} — ${
        user ? "that login is disabled" : "no such login"
      }`,
      // Not a failure of ours. Somebody typed an address we don't hold, or one
      // that has been switched off; both are the system working.
      outcome: "denied",
      actorKind: "consumer",
      actorEmail: email,
      detail: { email, reason: user ? "disabled" : "no_account" },
      request,
    });
    return ok;
  }

  let sent = false;
  let error: string | undefined;
  try {
    const token = await createPasswordSetToken(user.id, user.email, "reset", 48);
    const result = await sendUserCredentials({
      name: user.name,
      email: user.email,
      setPasswordUrl: passwordSetUrl(token),
      isReset: true,
    });
    sent = result.sent;
    error = result.error;
  } catch (err) {
    error = (err as Error).message;
  }

  await logActivity({
    action: "auth.password.forgot",
    summary: sent
      ? `${user.name} (${user.email}) asked for a password reset link`
      : `Password reset link for ${user.name} (${user.email}) DID NOT SEND${
          error ? `: ${error}` : ""
        }`,
    outcome: sent ? "success" : "failed",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    actorKind: "user",
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    panelBeaterId: user.panelBeaterId ?? null,
    // Whether it went, never where the link points.
    detail: { email: user.email, emailed: sent, emailError: error },
    request,
  });

  // Still the same 200 even when the send failed — the caller learning that
  // Resend choked would confirm the account exists just as surely as a
  // friendly "check your inbox" would.
  return ok;
}
