import { z } from "zod";

// Request bodies for /api/users (components/UsersManager.tsx). See
// lib/validate.ts for why every object here is strict. DELETE takes ?id=,
// not a body.

const password = z.string().max(1000);

/**
 * POST /api/users: an admin creates a login.
 *
 * role is checked against the caller's scope, and a workshop admin's
 * panelBeaterId is forced to their own, whatever is posted.
 *
 * Never set: id, passwordHash, active (always on), emailVerifiedAt,
 * twoFactorEnabled, createdAt, permissions (they come from the role).
 */
export const CreateUserBody = z.strictObject({
  name: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  password: password.optional(),
  role: z.string().max(200).optional(),
  // "" when no workshop is picked.
  panelBeaterId: z.string().max(200).optional(),
  sendEmail: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});

/**
 * PATCH /api/users. id selects the user; each control sends only its own
 * field.
 *
 * Never set: passwordHash, emailVerifiedAt, email, name, panelBeaterId (moving
 * someone between workshops would hand them another workshop's jobs),
 * permissions, createdAt.
 */
export const UpdateUserBody = z.strictObject({
  id: z.string().max(200).optional(),
  role: z.string().max(200).optional(),
  active: z.boolean().optional(),
  password: password.optional(),
  sendEmail: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
  welcome: z.boolean().optional(),
  resetLink: z.boolean().optional(),
});
