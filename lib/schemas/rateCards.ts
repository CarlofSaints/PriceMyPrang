import { z } from "zod";

// Request bodies for /api/rate-cards and /api/rate-cards/custom-types
// (components/RatesEditor.tsx). See lib/validate.ts for why every object here
// is strict. Both DELETEs take query parameters, not a body.

// A rate box emptied in the editor is deleted from the block, but Number() of
// odd input is NaN, which JSON sends as null: accepted rather than refused.
const rateBlock = z.record(z.string().max(200), z.number().nullable());

/** Which block of the card a rate sits in: lib/types RateScope. */
const RateValues = z.strictObject({
  in_warranty: rateBlock.optional(),
  out_of_warranty: rateBlock.optional(),
  aluminium: rateBlock.optional(),
  general: rateBlock.optional(),
});

/**
 * POST /api/rate-cards: create, or edit when id is given.
 *
 * id only SELECTS a card to edit, and the route refuses one belonging to
 * another workshop. panelBeaterId is resolved through resolveRateTarget, which
 * forces a workshop login onto its own listing.
 *
 * Never set: createdAt, updatedAt.
 */
export const SaveRateCardBody = z.strictObject({
  id: z.string().max(200).optional(),
  panelBeaterId: z.string().max(200).optional(),
  kind: z.enum(["cash", "insurance"]).optional(),
  insurerName: z.string().max(200).nullable().optional(),
  aluminium: z.boolean().optional(),
  values: RateValues.optional(),
});

/**
 * POST /api/rate-cards/custom-types: define a workshop's own rate.
 *
 * Never set: id, createdAt. The route keeps its own 60-character limit on the
 * label so its message still reaches the person typing.
 */
export const CreateCustomRateTypeBody = z.strictObject({
  panelBeaterId: z.string().max(200).optional(),
  label: z.string().max(200).optional(),
  unit: z.enum(["rand_per_hour", "rand", "percent"]).optional(),
});
