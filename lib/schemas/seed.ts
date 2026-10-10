import { z } from "zod";

// Request body for POST /api/seed. See lib/validate.ts for why it is strict.

/**
 * POST /api/seed: mint the first Site Admin. Called by hand (curl), no UI.
 *
 * force is kept because the route documents it: it lets the secret's holder
 * add an admin when one already exists.
 *
 * Never set: role (always "admin"), id, passwordHash, active, createdAt,
 * panelBeaterId.
 */
export const SeedBody = z.strictObject({
  secret: z.string().max(1000).optional(),
  name: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  password: z.string().max(1000).optional(),
  force: z.boolean().optional(),
});
