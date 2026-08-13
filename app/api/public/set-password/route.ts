import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { redeemPasswordSetToken } from "@/lib/store";
import { logActivity } from "@/lib/activityLog";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

/** Same floor as /api/auth/change-password, so the two can't disagree. */
const MIN_LENGTH = 10;

/**
 * Redeem a "choose your own password" link.
 *
 * PUBLIC by design: the link is opened in whatever browser the email was read
 * in, which is usually not the one that signed up. The token IS the credential
 * — there is no session to lean on and asking for the old password would defeat
 * the point, since the whole reason for this route is that they haven't got one.
 *
 * Rate-limited per IP even though the token is a uuid: a public endpoint that
 * changes a password should never be a free guessing machine, and the limiter
 * also caps how fast an expired-link retry loop can hammer the database.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit(`set-password:${ip}`, 10, 60_000);
  if (!limit.ok)
    return tooManyRequests(limit.retryAfter, "Too many attempts. Wait a minute and try again.");

  const b = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = b.token?.trim();
  const password = b.password ?? "";

  if (!token) return NextResponse.json({ error: "Missing link." }, { status: 400 });
  if (password.length < MIN_LENGTH)
    return NextResponse.json(
      { error: `Use at least ${MIN_LENGTH} characters.` },
      { status: 400 }
    );

  const result = await redeemPasswordSetToken(token, await hashPassword(password));

  if (!result) {
    // Deliberately vague about WHICH way it failed — used, expired, superseded
    // and never-existed all read the same, so the response can't be used to
    // sort real tokens from invented ones. The page explains what to do next.
    await logActivity({
      action: "auth.password.set",
      summary: "Someone opened a set-password link that was no longer usable",
      outcome: "failed",
      status: 400,
      actorKind: "consumer",
      request,
    });
    return NextResponse.json(
      { error: "That link has expired or has already been used." },
      { status: 400 }
    );
  }

  await logActivity({
    action: "auth.password.set",
    summary: `${result.name} set their own password from an emailed link`,
    entityType: "user",
    entityId: result.userId,
    entityLabel: result.name,
    // They have proved they hold the inbox, but they are not signed in yet.
    actorKind: "user",
    actorId: result.userId,
    actorName: result.name,
    actorEmail: result.email,
    detail: { email: result.email },
    request,
  });

  // No session is created here on purpose: setting a password should not also
  // sign in whoever is holding the link. They land on /login and use it.
  return NextResponse.json({ ok: true, email: result.email });
}
