// Voucher rules (lib/vouchers) and their request bodies. Pure: no database.
//   npm run test:vouchers
import {
  discountedFee, endOfDaySA, generateVoucherCode, normaliseVoucherCode, voucherProblem, voucherStatus,
} from "../lib/vouchers";
import { VoucherCreateBody, VoucherUpdateBody } from "../lib/schemas/vouchers";
import { VoucherApplyBody } from "../lib/schemas/public";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`);
}

console.log("\nCodes");
const codes = new Set(Array.from({ length: 2000 }, generateVoucherCode));
check("format PMP-XXXXXX", [...codes].every((c) => /^PMP-[A-HJKMNP-Z2-9]{6}$/.test(c)), [...codes][0]);
check("no look-alike characters (0 O 1 I L)", [...codes].every((c) => !/[01OIL]/.test(c.slice(4))));
check("2000 codes, no repeats", codes.size === 2000, codes.size);
check("typed lower case with spaces matches", normaliseVoucherCode(" pmp - ab3cd4 ") === "PMP-AB3CD4", normaliseVoucherCode(" pmp - ab3cd4 "));
check("a long dash typed on a phone matches", normaliseVoucherCode("PMP–AB3CD4") === "PMP-AB3CD4", normaliseVoucherCode("PMP–AB3CD4"));

console.log("\nPrice");
check("10% of R350 = R315", discountedFee(350, 10) === 315, discountedFee(350, 10));
check("15% of R350 = R297.50", discountedFee(350, 15) === 297.5, discountedFee(350, 15));
check("33% of R350 = R234.50 (to the cent)", discountedFee(350, 33) === 234.5, discountedFee(350, 33));
check("100% = R0", discountedFee(350, 100) === 0, discountedFee(350, 100));

console.log("\nExpiry (end of the day, SA time)");
const exp = endOfDaySA("2026-12-31");
check("2026-12-31 lasts until 21:59:59.999 UTC", exp.toISOString() === "2026-12-31T21:59:59.999Z", exp.toISOString());
const good = { active: true, expiresAt: exp, maxUses: 3, usesCount: 2 };
check("good on the day itself, 23:00 SA", voucherProblem(good, new Date("2026-12-31T23:00:00+02:00")) === null);
check("expired a minute after midnight SA", voucherProblem(good, new Date("2027-01-01T00:01:00+02:00")) === "That voucher has expired.");

console.log("\nWhen it can be used");
const now = new Date("2026-12-01T12:00:00+02:00");
check("unknown code refused", voucherProblem(null, now) === "That voucher code isn't valid.");
check("switched off reads as not valid (says nothing more)", voucherProblem({ ...good, active: false }, now) === "That voucher code isn't valid.");
check("last use still available", voucherProblem(good, now) === null);
check("used up", voucherProblem({ ...good, usesCount: 3 }, now) === "That voucher has already been used up.");
check("single use, used once = used up", voucherProblem({ ...good, maxUses: 1, usesCount: 1 }, now) !== null);
check("status Active", voucherStatus(good, now) === "Active");
check("status Used up", voucherStatus({ ...good, usesCount: 3 }, now) === "Used up");
check("status Switched off beats Expired", voucherStatus({ ...good, active: false, expiresAt: new Date(0) }, now) === "Switched off");

console.log("\nRequest bodies");
const ok = (s: { safeParse: (x: unknown) => { success: boolean } }, x: unknown) => s.safeParse(x).success;
check("create: good body", ok(VoucherCreateBody, { percentOff: 20, expiresOn: "2026-12-31", maxUses: 1 }));
check("create: 0% refused", !ok(VoucherCreateBody, { percentOff: 0, expiresOn: "2026-12-31", maxUses: 1 }));
check("create: 101% refused", !ok(VoucherCreateBody, { percentOff: 101, expiresOn: "2026-12-31", maxUses: 1 }));
check("create: 12.5% refused (whole numbers)", !ok(VoucherCreateBody, { percentOff: 12.5, expiresOn: "2026-12-31", maxUses: 1 }));
check("create: 0 uses refused", !ok(VoucherCreateBody, { percentOff: 20, expiresOn: "2026-12-31", maxUses: 0 }));
check("create: no date refused", !ok(VoucherCreateBody, { percentOff: 20, maxUses: 1 }));
check("create: client can't choose the code", !ok(VoucherCreateBody, { percentOff: 20, expiresOn: "2026-12-31", maxUses: 1, code: "FREE" }));
check("create: client can't set usesCount", !ok(VoucherCreateBody, { percentOff: 20, expiresOn: "2026-12-31", maxUses: 5, usesCount: -5 }));
check("update: only on/off", !ok(VoucherUpdateBody, { id: "x", active: true, percentOff: 100 }));
check("apply: token + code", ok(VoucherApplyBody, { token: "t", code: "PMP-ABC123" }));
check("apply: can't send a price", !ok(VoucherApplyBody, { token: "t", code: "PMP-ABC123", amount: 0 }));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
