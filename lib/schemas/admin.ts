import { z } from "zod";

// Request bodies for /api/admin/integrations and /api/agreement. See
// lib/validate.ts for why every object here is strict.

/**
 * POST /api/admin/integrations: save a key, or reveal the stored one.
 *
 * `id` stays a free string so the route keeps its "Unknown integration" reply.
 *
 * Never set: masked, ciphertext / iv / tag (derived from `key` by
 * encryptSecret), updatedAt, updatedByName (from the session).
 */
export const IntegrationBody = z.strictObject({
  action: z.enum(["save", "reveal"]).optional(),
  id: z.string().max(100).optional(),
  key: z.string().max(5000).optional(),
  clientId: z.string().max(500).optional(),
  password: z.string().max(1000).optional(),
});

/**
 * DELETE /api/admin/integrations: remove a stored key. No UI calls this yet.
 *
 * Never set: anything but which key and the caller's own password.
 */
export const DeleteIntegrationBody = z.strictObject({
  id: z.string().max(100).optional(),
  password: z.string().max(1000).optional(),
});

/**
 * POST /api/agreement (multipart): upload a new repairer agreement. Validated
 * as the object built from the FormData, so a File arrives as itself.
 *
 * `file` is optional here so the route keeps its own "Choose a .docx file"
 * reply when it is missing.
 *
 * Never set: id, html (converted from the file), sourceUrl / sourcePathname
 * (where we stored it), active (uploading makes it active, server-side),
 * uploadedByName (from the session), createdAt.
 */
export const AgreementUploadForm = z.strictObject({
  file: z.instanceof(File).optional(),
  title: z.string().max(200).optional(),
});
