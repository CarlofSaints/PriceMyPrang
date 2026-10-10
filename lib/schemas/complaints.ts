import { z } from "zod";

// Request bodies for /api/complaints. See lib/validate.ts for why every object
// here is strict.

/**
 * PATCH /api/complaints: move a complaint along.
 *
 * `status` stays a string so the route keeps its own "Unknown status" reply.
 *
 * Never set: panelBeaterId (who it is against is fixed on the complaint, and
 * the route scopes by the session), reference, createdAt, updatedAt.
 */
export const ComplaintStatusBody = z.strictObject({
  id: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
});

/**
 * POST /api/complaints: add a note or response.
 *
 * `internal` is accepted from anyone but only honoured for PMP staff: the
 * route forces it false for a workshop.
 *
 * Never set: authorName (from the session), createdAt, panelBeaterId.
 */
export const ComplaintNoteBody = z.strictObject({
  id: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  internal: z.boolean().optional(),
});
