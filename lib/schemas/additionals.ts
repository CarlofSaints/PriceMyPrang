import { z } from "zod";

// Request bodies for /api/additionals and /api/additionals/send. See
// lib/validate.ts for why every object here is strict.

const id = z.string().max(200);

/**
 * One line of an additionals request, exactly as AdditionalsManager posts it:
 * a fresh `emptyLine`, or a saved line read back through toLineItem().
 *
 * Never set: id, additionalId, sortOrder (the server numbers the lines in the
 * order given), and every total. Totals are recomputed from these amounts on
 * the server, so a number the browser supplied never reaches the insurer.
 */
export const AdditionalLine = z.strictObject({
  code: z.string().max(200).optional(),
  description: z.string().max(2000),
  quantity: z.number(),
  partsCost: z.number().optional(),
  partsAmount: z.number(),
  supplierId: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  panelCode: z.string().max(200).optional(),
  panelAmount: z.number(),
  panelHours: z.number(),
  paintCode: z.string().max(200).optional(),
  paintAmount: z.number(),
  paintHours: z.number(),
  stripCode: z.string().max(200).optional(),
  stripAmount: z.number(),
  stripHours: z.number(),
});

/**
 * POST /api/additionals: save a draft (new, or rework one with `id`).
 *
 * Never set: requestId (looked up from `reference`), seq (allocated in the
 * transaction), status, every total (partsTotal..total, computed server-side),
 * sentAt / sentToEmail / contactId (only the send step stamps those),
 * createdAt, createdByName (from the session).
 *
 * panelBeaterId is accepted because staff legitimately name the workshop they
 * are acting for. For a workshop login actingWorkshop() pins it to their own,
 * whatever this says.
 */
export const SaveAdditionalBody = z.strictObject({
  id: id.optional(),
  reference: z.string().max(200).optional(),
  panelBeaterId: id.optional(),
  reason: z.string().max(20000).optional(),
  claimNumber: z.string().max(200).optional(),
  lines: z.array(AdditionalLine).max(500).optional(),
});

/**
 * PATCH /api/additionals: record the insurer's answer.
 *
 * `status` stays a string so the route keeps its own "Unknown status" reply.
 *
 * Never set: respondedAt (stamped server-side), total, seq, sentAt.
 */
export const AdditionalStatusBody = z.strictObject({
  id: id.optional(),
  panelBeaterId: id.optional(),
  status: z.string().max(40).optional(),
  responseNote: z.string().max(20000).optional(),
});

/**
 * POST /api/additionals/send: email it to the insurer (and the client).
 *
 * Never set: sentAt, sentToName, clientEmail, insurerSent / clientSent. Those
 * record what actually happened, so only the send itself may write them.
 */
export const SendAdditionalBody = z.strictObject({
  id: id.optional(),
  panelBeaterId: id.optional(),
  contactId: id.optional(),
  email: z.string().max(320).optional(),
  notifyClient: z.boolean().optional(),
});
