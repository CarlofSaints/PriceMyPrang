import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createEmailVerification, redeemEmailVerification } from "@/lib/store";
import { sendEmailVerification } from "@/lib/email";
import { hit, LIMITS, clientIp, tooManyRequests } from "@/lib/rateLimit";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import { parseJson } from "@/lib/validate";
import { VerifyEmailBody } from "@/lib/schemas/auth";

/**
 * POST: redeem a token, or ask for a fresh link.
 *
 * Redeeming is deliberately NOT gated on a session: the link is usually opened
 * in whatever browser the email was read in, which may not be the one that
 * signed up. The token is the credential.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = await hit("verifyEmail", ip);
  if (!limited.ok) return tooManyRequests(limited.retryAfter, LIMITS.verifyEmail.message);

  const parsed = await parseJson(request, VerifyEmailBody, "POST /api/auth/verify-email");
  if (parsed.response) return parsed.response;
  const { token, resend } = parsed.data;

  if (resend) {
    // Re-sending DOES need a session: otherwise anyone could make us mail a
    // stranger repeatedly just by knowing their address.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

    const fresh = await createEmailVerification(user.id, user.email);
    await sendEmailVerification(user.email, user.name, fresh);
    await logActivity({
      action: "auth.email_verification.resend",
      summary: `${user.name} asked for a fresh confirmation link`,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      ...actorFromUser(user),
      request,
    });
    return NextResponse.json({ ok: true });
  }

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const result = await redeemEmailVerification(token);
  if (!result) {
    // The token is the credential, so it is never written to the log.
    await logActivity({
      action: "auth.email_verification",
      summary: "A confirmation link was opened after expiring or being used",
      outcome: "failed",
      status: 400,
      actorKind: "consumer",
      request,
    });
    return NextResponse.json(
      { error: "That link has expired or has already been used. Ask for a new one." },
      { status: 400 }
    );
  }

  await logActivity({
    action: "auth.email_verification",
    summary: `${result.name} confirmed their email address`,
    entityType: "user",
    entityId: result.userId,
    entityLabel: result.name,
    actorKind: "user",
    actorId: result.userId,
    actorName: result.name,
    actorEmail: result.email,
    request,
  });

  return NextResponse.json({ ok: true, email: result.email });
}
