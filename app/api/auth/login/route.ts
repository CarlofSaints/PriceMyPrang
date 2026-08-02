import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/store";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

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
  if (!byIp.ok)
    return tooManyRequests(byIp.retryAfter, "Too many sign-in attempts. Please try again shortly.");

  const byAccount = rateLimit(`login-acct:${key}`, PER_ACCOUNT.limit, PER_ACCOUNT.windowMs);
  if (!byAccount.ok)
    return tooManyRequests(
      byAccount.retryAfter,
      "Too many sign-in attempts for this account. Please wait a few minutes and try again."
    );

  const user = await findUserByEmail(key);
  // One message for every failure — "no such user" and "wrong password" must
  // not be distinguishable, or this becomes a way to discover who has an account.
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
