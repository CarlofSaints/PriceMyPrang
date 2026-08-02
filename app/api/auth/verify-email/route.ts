import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createEmailVerification, redeemEmailVerification } from "@/lib/store";
import { sendEmailVerification } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

/**
 * POST — redeem a token, or ask for a fresh link.
 *
 * Redeeming is deliberately NOT gated on a session: the link is usually opened
 * in whatever browser the email was read in, which may not be the one that
 * signed up. The token is the credential.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`verify-email:${ip}`, 10, 15 * 60_000);
  if (!limited.ok)
    return tooManyRequests(limited.retryAfter, "Too many attempts. Please wait a few minutes.");

  const { token, resend } = (await request.json()) as { token?: string; resend?: boolean };

  if (resend) {
    // Re-sending DOES need a session — otherwise anyone could make us mail a
    // stranger repeatedly just by knowing their address.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

    const fresh = await createEmailVerification(user.id, user.email);
    await sendEmailVerification(user.email, user.name, fresh);
    return NextResponse.json({ ok: true });
  }

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const result = await redeemEmailVerification(token);
  if (!result)
    return NextResponse.json(
      { error: "That link has expired or has already been used. Ask for a new one." },
      { status: 400 }
    );

  return NextResponse.json({ ok: true, email: result.email });
}
