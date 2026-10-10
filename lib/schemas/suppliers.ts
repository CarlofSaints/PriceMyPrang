import { z } from "zod";

// Request bodies for /api/suppliers: Price my Prang's OWN supplier list
// (components/SuppliersManager.tsx), not a workshop's book. See lib/validate.ts
// for why every object here is strict.

const partTypes = z.array(z.enum(["new", "used", "alternate"])).max(10);
const makes = z.array(z.string().max(200)).max(500);

/**
 * POST /api/suppliers.
 *
 * Never set: id (slugged from the name), panelBeaterId (this is the global
 * book; a workshop's private suppliers go through /api/my-suppliers), active
 * (a new supplier is always active), createdAt.
 */
export const CreateSupplierBody = z.strictObject({
  name: z.string().max(200).optional(),
  partTypes: partTypes.optional(),
  makes: makes.optional(),
  supplies: z.string().max(20000).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(100).optional(),
});

/**
 * PATCH /api/suppliers. id selects the supplier; every other field is sent
 * alone, one edit at a time.
 *
 * Never set: panelBeaterId, createdAt.
 */
export const UpdateSupplierBody = z.strictObject({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  partTypes: partTypes.optional(),
  makes: makes.optional(),
  supplies: z.string().max(20000).optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(100).optional(),
  active: z.boolean().optional(),
});

/** DELETE /api/suppliers. Never set: anything but the id. */
export const DeleteSupplierBody = z.strictObject({
  id: z.string().max(200).optional(),
});
