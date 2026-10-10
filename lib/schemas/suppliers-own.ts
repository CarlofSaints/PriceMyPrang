import { z } from "zod";

// ---------------------------------------------------------------------------
// Bodies for /api/my-suppliers: a workshop's OWN supplier book. The workshop
// is the SESSION's, except for PMP staff building a quote on a workshop's
// behalf (see gate() in the route).
// ---------------------------------------------------------------------------

const text = z.string().max(200).optional();

/** Every field the supplier form may set: the route's fields(). */
const supplierFields = {
  name: text,
  supplies: z.string().max(20000).optional(),
  email: z.string().max(320).optional(),
  phone: text,
  companyRegNumber: text,
  vatNumber: text,
  address: z.string().max(1000).optional(),
  mainContactName: text,
  mainContactPhone: text,
  mainContactEmail: z.string().max(320).optional(),
  billingContactName: text,
  billingContactPhone: text,
  billingContactEmail: z.string().max(320).optional(),
};

/**
 * POST /api/my-suppliers. `panelBeaterId` is sent by the quote builder and
 * HONOURED ONLY for staff (build_quotes / manage_panel_beaters); a workshop
 * login always writes to its own book whatever it names.
 * NEVER-SET: id, createdAt, active, partTypes and makes (the platform list's
 * fields, not this book's).
 */
export const OwnSupplierCreateBody = z.strictObject({
  ...supplierFields,
  panelBeaterId: z.string().max(200).optional(),
});

/**
 * PATCH /api/my-suppliers.
 * NEVER-SET: panelBeaterId (the book is always the session's on an edit),
 * createdAt, active, partTypes, makes.
 */
export const OwnSupplierUpdateBody = z.strictObject({
  id: z.string().max(200).optional(),
  ...supplierFields,
});

/** DELETE /api/my-suppliers. NEVER-SET: panelBeaterId, anything but the id. */
export const OwnSupplierDeleteBody = z.strictObject({
  id: z.string().max(200).optional(),
});
