import { NextResponse } from "next/server";
import { findUserByEmail, createLoginChallenge } from "@/lib/store";
import { verifyPassword, createSession, hashPassword, generateOtp } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";
import { sendLoginCode } from "@/lib/email";
import { logActivity } from "@/lib/activityLog";

// Two limits, because they stop different attacks:
//
//  - per ACCOUNT: someone working through a password list against one known
//    email. Keyed on the address, so moving between IPs doesn't reset it.
//  - per IP: someone spraying one common password across many addresses. The
//    per-account limit never trips for that, since each account sees one try.
//
// Both are deliberately generous enough that a person mistyping their own
// password a few times is never affected.
const PER_ACCOUNT = { limit: 8, windowMs: 15 * 60_000 };
const PER_IP = { limit: 30, windowMs: 15 * 60_000 };

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const ip = clientIp(request);
  const key = email.trim().toLowerCase();

  const byIp = rateLimit(`login-ip:${ip}`, PER_IP.limit, PER_IP.windowMs);
  if (!byIp.ok) {
    // Worth a line of its own. A burst of these from one address is the only
    // early sign of someone working through a password list, and the limiter
    // itself keeps no history.
    await logActivity({
      action: "auth.login.blocked",
      summary: `Sign-in blocked: too many attempts from this address (${key})`,
      outcome: "denied",
      status: 429,
      actorKind: "consumer",
      actorEmail: key,
      detail: { reason: "ip_rate_limit", limit: PER_IP.limit },
      request,
    });
    return tooManyRequests(byIp.retryAfter, "Too many sign-in attempts. Please try again shortly.");
  }

  const byAccount = rateLimit(`login-acct:${key}`, PER_ACCOUNT.limit, PER_ACCOUNT.windowMs);
  if (!byAccount.ok) {
    await logActivity({
      action: "auth.login.blocked",
      summary: `Sign-in blocked: too many attempts for ${key}`,
      outcome: "denied",
      status: 429,
      actorKind: "consumer",
      actorEmail: key,
      detail: { reason: "account_rate_limit", limit: PER_ACCOUNT.limit },
      request,
    });
    return tooManyRequests(
      byAccount.retryAfter,
      "Too many sign-in attempts for this account. Please wait a few minutes and try again."
    );
  }

  const user = await findUserByEmail(key);
  // One message for every failure — "no such user" and "wrong password" must
  // not be distinguishable, or this becomes a way to discover who has an account.
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    // The LOG may distinguish them; the RESPONSE still must not. Which of the
    // three it was is the first thing you need when someone says they can't get
    // in, and this record is only ever read by a Super Admin.
    await logActivity({
      action: "auth.login",
      summary: `Failed sign-in for ${key}`,
      outcome: "denied",
      status: 401,
      actorKind: user ? "user" : "consumer",
      actorId: user?.id,
      actorName: user?.name,
      actorEmail: key,
      actorRole: user?.role,
      panelBeaterId: user?.panelBeaterId,
      detail: {
        reason: !user ? "no_such_account" : !user.active ? "account_disabled" : "wrong_password",
      },
      request,
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Second factor. NO SESSION is created here — a correct password alone must
  // not be enough to be signed in, which is the entire point of the factor.
  if (user.twoFactorEnabled) {
    const code = generateOtp();
    const challengeId = await createLoginChallenge(user.id, await hashPassword(code));
    await sendLoginCode(user.email, user.name, code);
    await logActivity({
      action: "auth.two_factor.sent",
      summary: `${user.name} passed their password; a sign-in code was emailed`,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      actorRole: user.role,
      panelBeaterId: user.panelBeaterId,
      request,
    });
    return NextResponse.json({ twoFactorRequired: true, challengeId });
  }

  await createSession(user.id);
  await logActivity({
    action: "auth.login",
    summary: `${user.name} signed in`,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    actorRole: user.role,
    panelBeaterId: user.panelBeaterId,
    detail: { mustChangePassword: user.mustChangePassword ?? false },
    request,
  });
  return NextResponse.json({ ok: true, role: user.role });
}
