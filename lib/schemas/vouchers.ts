import { z } from "zod";

// Request bodies for /api/vouchers (Super Admin). Strict, like every body
// (lib/validate.ts). The code is never sent: the server generates it.

/** POST: make a voucher. Single use is simply maxUses 1. */
export const VoucherCreateBody = z.strictObject({
  percentOff: z.number().int().min(1, "Discount must be 1% to 100%").max(100, "Discount must be 1% to 100%"),
  /** The last day it works, as the date picker gives it: YYYY-MM-DD. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expiry date"),
  maxUses: z.number().int().min(1, "Uses must be at least 1").max(100000, "Uses can be at most 100 000"),
  note: z.string().max(200).optional(),
});

/** PATCH: switch a voucher off or back on. Nothing else changes once made. */
export const VoucherUpdateBody = z.strictObject({
  id: z.string().max(100),
  active: z.boolean(),
});
