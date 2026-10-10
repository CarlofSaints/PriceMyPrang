import { z } from "zod";

// ---------------------------------------------------------------------------
// Bodies for /api/insurers (the platform list, manage_insurers only) and
// /api/insurers/contacts (generic contacts for staff, private ones for a
// workshop). Shapes only: the permission checks stay in the routes.
// ---------------------------------------------------------------------------

const name = z.string().max(200);
const id = z.string().max(200);

/**
 * POST /api/insurers.
 * NEVER-SET: id (minted from the name), active (a new insurer starts active),
 * createdAt.
 */
export const InsurerCreateBody = z.strictObject({
  name: name.optional(),
});

/**
 * PATCH /api/insurers. `id` picks the row; name and active are the two things
 * the Insurers page edits.
 * NEVER-SET: createdAt.
 */
export const InsurerUpdateBody = z.strictObject({
  id: id.optional(),
  name: name.optional(),
  active: z.boolean().optional(),
});

/** DELETE /api/insurers. NEVER-SET: anything but the id. */
export const InsurerDeleteBody = z.strictObject({
  id: id.optional(),
});

const contactFields = {
  name: name.optional(),
  role: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(100).optional(),
  notes: z.string().max(20000).optional(),
};

/**
 * POST /api/insurers/contacts. `generic: true` asks for a shared contact and
 * is refused without manage_insurers.
 * NEVER-SET: panelBeaterId (a private contact is pinned to the SESSION's
 * workshop, or one workshop could plant contacts in another's list), id,
 * createdAt.
 */
export const InsurerContactCreateBody = z.strictObject({
  insurerId: id.optional(),
  generic: z.boolean().optional(),
  ...contactFields,
});

/**
 * PATCH /api/insurers/contacts. No UI calls it today; the route accepts these.
 * NEVER-SET: panelBeaterId and insurerId (a contact can't be moved to another
 * workshop or insurer), generic (shared vs private is fixed at creation), createdAt.
 */
export const InsurerContactUpdateBody = z.strictObject({
  id: id.optional(),
  ...contactFields,
});
