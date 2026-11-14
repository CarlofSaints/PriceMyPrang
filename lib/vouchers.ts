// ---------------------------------------------------------------------------
// Discount vouchers on the customer's request fee.
//
// Made on /portal/admin/vouchers, typed in on /pay/[token]. The voucher is
// remembered on the request, checked AGAIN when the customer presses Pay, and
// a use is only counted when a payment using it succeeds (lib/payments.ts).
// So a code typed in and abandoned never burns a single-use voucher.
//
// shortcut: two customers paying with the LAST use of a voucher at the same
// moment can both succeed (the count goes one over). Fine for promo codes; if
// a voucher ever carries real money value, reserve the use at Pay instead.
// ---------------------------------------------------------------------------

/** No 0/O, 1/I/L: a code read out over the phone must survive it. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** PMP-XXXXXX: 31^6 is about 887 million codes, and guessing is rate-limited. */
export function generateVoucherCode(): string {
  // Web Crypto, not node:crypto: this file is also loaded in the browser (VouchersManager).
  // Bytes >= 248 are dropped so every letter is equally likely (248 = 31 x 8).
  let s = "";
  while (s.length < 6) {
    const [b] = crypto.getRandomValues(new Uint8Array(1));
    if (b < 248) s += ALPHABET[b % ALPHABET.length];
  }
  return `PMP-${s}`;
}

/** What people type ("pmp - abc123 ") into what is stored ("PMP-ABC123"). */
export function normaliseVoucherCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").replace(/[‐-―]/g, "-");
}

/** The fee after the discount, to the cent. */
export function discountedFee(fee: number, percentOff: number): number {
  return Math.round(fee * (100 - percentOff)) / 100;
}

/** "2026-12-31" -> the last millisecond of that day in South Africa (UTC+2, no DST). */
export function endOfDaySA(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999+02:00`);
}

export type VoucherLike = { active: boolean; expiresAt: Date; maxUses: number; usesCount: number };

/** Why this voucher can't be used right now, in words for the customer. Null = good. */
export function voucherProblem(v: VoucherLike | null, now = new Date()): string | null {
  if (!v || !v.active) return "That voucher code isn't valid.";
  if (v.expiresAt.getTime() < now.getTime()) return "That voucher has expired.";
  if (v.usesCount >= v.maxUses) return "That voucher has already been used up.";
  return null;
}

/** For the staff list: one word for where a voucher stands. */
export function voucherStatus(v: VoucherLike, now = new Date()): "Active" | "Switched off" | "Expired" | "Used up" {
  if (!v.active) return "Switched off";
  if (v.expiresAt.getTime() < now.getTime()) return "Expired";
  if (v.usesCount >= v.maxUses) return "Used up";
  return "Active";
}
