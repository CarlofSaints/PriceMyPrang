import { z } from "zod";

// Request bodies for /api/auth/*. See lib/validate.ts for why every object here
// is strict. Fields are optional where the route has its own friendlier "X
// required" reply, so that reply still reaches the person typing.

const password = z.string().max(1000);

/**
 * POST /api/auth/login.
 *
 * Never set: role, active, twoFactorEnabled, mustChangePassword, userId. All of
 * them come from the stored account, never from the person signing in.
 */
export const LoginBody = z.strictObject({
  email: z.string().max(320).optional(),
  password: password.optional(),
});

/**
 * POST /api/auth/verify-otp. challengeId is minted by the login step and only
 * echoed back here: it identifies the challenge, the code is the proof.
 *
 * Never set: userId (read from the challenge), attempts, codeHash.
 */
export const VerifyOtpBody = z.strictObject({
  challengeId: z.string().max(200).optional(),
  code: z.string().max(50).optional(),
});

/**
 * POST /api/auth/change-password. Always the signed-in user's own.
 *
 * Never set: userId, passwordHash, mustChangePassword (cleared server-side
 * once the change succeeds).
 */
export const ChangePasswordBody = z.strictObject({
  currentPassword: password.optional(),
  newPassword: password.optional(),
});

/**
 * POST /api/auth/two-factor. Always the signed-in user's own.
 *
 * Never set: userId (it is the session's), role / permissions (the route
 * checks the session's own to allow switching it off).
 */
export const TwoFactorBody = z.strictObject({
  enabled: z.boolean().optional(),
  password: password.optional(),
});

/**
 * POST /api/auth/verify-email: redeem a token, or ask for a fresh link.
 * Today's UI only sends { resend: true }; the token is redeemed by the
 * /verify-email/[token] page directly, but the route still accepts it.
 *
 * Never set: userId, email, emailVerifiedAt. Who is being verified comes from
 * the token or the session, never the body.
 */
export const VerifyEmailBody = z.strictObject({
  token: z.string().max(500).optional(),
  resend: z.boolean().optional(),
});
