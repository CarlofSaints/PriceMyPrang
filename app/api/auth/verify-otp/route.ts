import { NextResponse } from "next/server";
import {
  getLoginChallenge,
  recordChallengeAttempt,
  consumeLoginChallenge,
  findUserById,
} from "@/lib/store";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

// Second half of a two-factor sign-in. The password was already checked; this
// is where the session is finally issued.
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`otp:${ip}`, 20, 15 * 60_000);
  if (!limited.ok)
    return tooManyRequests(limited.retryAfter, "Too many attempts. Please wait a few minutes.");

  const { challengeId, code } = (await request.json()) as {
    challengeId?: string;
    code?: string;
  };
  if (!challengeId || !code)
    return NextResponse.json({ error: "Enter the code we emailed you" }, { status: 400 });

  const challenge = await getLoginChallenge(challengeId);
  // Expired, already used, or never existed — all the same outwardly.
  if (!challenge)
    return NextResponse.json(
      { error: "That code has expired. Please sign in again." },
      { status: 400 }
    );

  if (!(await verifyPassword(code.trim(), challenge.codeHash))) {
    const attempts = await recordChallengeAttempt(challengeId);
    const left = Math.max(0, 5 - attempts);
    return NextResponse.json(
      {
        error: left
          ? `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many wrong codes. Please sign in again.",
      },
      { status: 401 }
    );
  }

  // Burn it before issuing the session, so the same code can't be replayed.
  await consumeLoginChallenge(challengeId);

  const user = await findUserById(challenge.userId);
  if (!user || !user.active)
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
