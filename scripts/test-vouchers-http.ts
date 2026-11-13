// ---------------------------------------------------------------------------
// Vouchers over real HTTP, against a throwaway local copy (scripts/lib/localStack.ts):
// staff create them, a customer applies one on the pay page, a 100% voucher
// completes the request with no payment, and a stale voucher is refused at Pay.
//
// Ozow keys are FAKE: only paths that never call Ozow are exercised. A partly
// discounted payment (which does go to Ozow) is not tested here.
//
//   npm run test:vouchers-http
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";
import { startLocalStack, type LocalStack } from "./lib/localStack";

let stack: LocalStack;
let pass = 0;
let fail = 0;
function check(ok: boolean, text: string, got?: unknown) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}${ok ? "" : `   (got ${String(JSON.stringify(got)).slice(0, 300)})`}`);
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${stack.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Test-password-123" }),
  });
  const cookie = r.headers.get("set-cookie")?.match(/pmp_session=[^;]+/)?.[0];
  if (r.status !== 200 || !cookie) throw new Error(`login ${email} failed: ${r.status} ${await r.text()}`);
  return cookie;
}

async function call(cookie: string | null, method: string, path: string, body?: unknown) {
  const r = await fetch(`${stack.baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* page HTML */
  }
  return { status: r.status, json, text };
}

/** zar() output, e.g. "R 280,00" (the space may be a no-break space). */
const money = (n: string) => new RegExp(`R[\\s\\u00a0]${n}`);
const one = async (q: string, p: unknown[] = []) => (await stack.sql.query(q, p)).rows[0];
const day = (offset: number) => new Date(Date.now() + 2 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);

async function seed() {
  const now = new Date();
  const pw = await bcrypt.hash("Test-password-123", 10);
  // Migrations seed only the workshop roles; the site admin role is made at first run.
  await stack.sql.query(
    `INSERT INTO roles (id, name, permissions, system, scope, "createdAt", "updatedAt") VALUES ('admin', 'Site Admin', '{}', true, 'platform', $1, $1)`,
    [now]
  );
  await stack.sql.query(
    `INSERT INTO panel_beaters (id, "companyName", "companyRegNumber", "physicalAddress", "rmiNumber", "updatedAt") VALUES ('ws_A', 'Workshop A', 'REG', '1 Road', 'RMI', $1)`,
    [now]
  );
  for (const [id, email, role, ws] of [["u_admin", "admin@test.local", "admin", null], ["u_pb", "pb@test.local", "pb_admin", "ws_A"]]) {
    await stack.sql.query(
      `INSERT INTO users (id, name, email, "passwordHash", "roleId", "panelBeaterId", active, "mustChangePassword", "emailVerifiedAt", "twoFactorEnabled", "updatedAt")
       VALUES ($1, $1, $2, $3, $4, $5, true, false, $6, false, $6)`,
      [id, email, pw, role, ws, now]
    );
  }
  for (const n of [1, 2]) {
    await stack.sql.query(
      `INSERT INTO quote_requests (id, reference, "publicToken", "firstName", "lastName", email, phone, "hasInsurance", "underWarranty", "isInsuranceClaim", "isThirdPartyClaim", "suspectedEngineDamage", "updatedAt")
       VALUES ($1, $2, $3, 'Test', 'Driver', 'driver@test.local', '0820000000', 'no', 'no', 'no', 'no', 'no', $4)`,
      [`req${n}`, `PMP-20261113-DRIVER-0${n}`, `token-${n}`, now]
    );
    // As after a real submission whose Ozow link was never paid: the pay page reads "unpaid".
    await stack.sql.query(
      `INSERT INTO payments (id, "requestId", amount, status, "statusReason", "updatedAt") VALUES ($1, $2, 350, 'failed', 'Link expired unpaid', $3)`,
      [`pay_old${n}`, `req${n}`, now]
    );
  }
}

async function main() {
  console.log("Starting a throwaway local copy (fresh Postgres, every migration, fake Ozow keys)...");
  stack = await startLocalStack({
    log: (m) => console.log(`  ${m}`),
    env: { OZOW_CLIENT_ID: "fake", OZOW_CLIENT_SECRET: "fake", OZOW_SITE_CODE: "FAKE", OZOW_ENV: "staging" },
  });
  try {
    await seed();
    const admin = await login("admin@test.local");
    const pb = await login("pb@test.local");

    console.log("\nWho can make vouchers");
    check((await call(pb, "GET", "/api/vouchers")).status === 403, "a workshop login can't list vouchers (403)");
    check((await call(pb, "POST", "/api/vouchers", { percentOff: 100, expiresOn: day(5), maxUses: 99 })).status === 403, "a workshop login can't make one (403)");
    check((await call(null, "GET", "/api/vouchers")).status === 401, "signed out: 401");
    const page = await call(admin, "GET", "/portal/admin/vouchers");
    check(page.status === 200 && page.text.includes("Generate voucher"), "staff page opens for the site admin");

    console.log("\nMaking them");
    check((await call(admin, "POST", "/api/vouchers", { percentOff: 20, expiresOn: day(-1), maxUses: 1 })).status === 400, "an expiry date in the past is refused");
    const v20 = await call(admin, "POST", "/api/vouchers", { percentOff: 20, expiresOn: day(0), maxUses: 3, note: "test" });
    const code20 = String(v20.json.code);
    check(v20.status === 200 && /^PMP-[A-Z2-9]{6}$/.test(code20), "20%, 3 uses, expires today -> code generated", v20.json);
    const v100 = await call(admin, "POST", "/api/vouchers", { percentOff: 100, expiresOn: day(30), maxUses: 1 });
    const code100 = String(v100.json.code);
    check(v100.status === 200, "100%, single use -> code generated", v100.json);

    console.log("\nQuote form (before the request exists)");
    const chk = await call(null, "POST", "/api/public/voucher", { code: code20 });
    check(chk.status === 200 && chk.json.amount === 280, "Apply on the form: R280, nothing saved", chk.json);
    check(Number((await one(`SELECT count(*) AS n FROM quote_requests WHERE "voucherId" IS NOT NULL`)).n) === 0, "checking changed no request");
    const sub = await call(null, "POST", "/api/requests", { firstName: "A", lastName: "B", email: "a@b.test", phone: "0820000000", hasInsurance: "no", underWarranty: "no", isInsuranceClaim: "no", isThirdPartyClaim: "no", suspectedEngineDamage: "no", voucherCode: "PMP-NOPE22" });
    check(sub.status === 400 && sub.json.field === "voucherCode", "submitting with a bad code is refused before anything is saved", sub.json);
    check(Number((await one(`SELECT count(*) AS n FROM quote_requests`)).n) === 2, "no request was created");

    console.log("\nCustomer applies a voucher on the pay page");
    const bad = await call(null, "POST", "/api/public/voucher", { token: "token-1", code: "PMP-NOPE22" });
    check(bad.status === 400 && bad.json.error === "That voucher code isn't valid.", "a wrong code is refused with a plain message", bad.json);
    const applied = await call(null, "POST", "/api/public/voucher", { token: "token-1", code: ` ${code20.toLowerCase()} ` });
    check(applied.status === 200 && applied.json.amount === 280, "typed in lower case with spaces: R350 -> R280", applied.json);
    const pay1 = await call(null, "GET", "/pay/token-1");
    check(money("280,00 securely").test(pay1.text) && pay1.text.includes("line-through"), "pay page shows R350 struck through and Pay R280", pay1.status);
    check(Number((await one(`SELECT "usesCount" FROM vouchers WHERE code = $1`, [code20])).usesCount) === 0, "applying does NOT use it up (counted only when paid)");
    const removed = await call(null, "POST", "/api/public/voucher", { token: "token-1", code: "" });
    check(removed.status === 200 && removed.json.amount === 350, "Remove puts the full price back", removed.json);
    check((await call(null, "POST", "/api/public/voucher", { token: "nope", code: code20 })).status === 404, "unknown token: 404");

    console.log("\n100% voucher: no payment at all");
    const free = await call(null, "POST", "/api/public/voucher", { token: "token-2", code: code100 });
    check(free.status === 200 && free.json.amount === 0, "100% applied: R0", free.json);
    check((await call(null, "GET", "/pay/token-2")).text.includes("Confirm my request"), "button reads Confirm my request, not Pay");
    const paid = await call(null, "POST", "/api/public/pay", { token: "token-2" });
    check(paid.status === 200 && paid.json.kind === "paid", "Confirm -> paid, without Ozow", paid.json);
    const prow = await one(`SELECT provider, amount::text, status, "voucherCode", "voucherPercentOff" FROM payments WHERE "requestId" = 'req2' AND status = 'paid'`);
    check(prow?.provider === "voucher" && prow?.status === "paid" && Number(prow?.amount) === 0 && prow?.voucherCode === code100 && prow?.voucherPercentOff === 100, "payment row: voucher, R0, paid, code recorded", prow);
    check(Number((await one(`SELECT "usesCount" FROM vouchers WHERE code = $1`, [code100])).usesCount) === 1, "single-use voucher now used once");
    check((await call(null, "GET", "/pay/token-2")).text.includes("Payment received"), "pay page now shows it done");
    const again = await call(null, "POST", "/api/public/voucher", { token: "token-1", code: code100 });
    check(again.status === 400 && again.json.error === "That voucher has already been used up.", "someone else trying the used single-use code is refused", again.json);
    check((await call(null, "POST", "/api/public/voucher", { token: "token-2", code: code20 })).status === 409, "a paid request can't take a voucher (409)");

    console.log("\nA voucher that stops being valid after it was typed in");
    await call(null, "POST", "/api/public/voucher", { token: "token-1", code: code20 });
    const off = await call(admin, "PATCH", "/api/vouchers", { id: v20.json.id, active: false });
    check(off.status === 200 && off.json.active === false, "staff switch it off");
    const stale = await call(null, "POST", "/api/public/pay", { token: "token-1", expectedAmount: 280 });
    check(stale.json.kind === "price_changed" && String(stale.json.reason).includes("isn't valid"), "Pay (page showed R280) refuses and says why, opens nothing", stale.json);
    check((await one(`SELECT "voucherId" FROM quote_requests WHERE id = 'req1'`)).voucherId === null, "and takes it off the request, so the full price applies");
    check(money("350,00 securely").test((await call(null, "GET", "/pay/token-1")).text), "pay page back to R350");
    check((await call(admin, "PATCH", "/api/vouchers", { id: v20.json.id, active: true, percentOff: 90 })).status === 400, "staff can't change the discount after making it (strict body)");


    console.log("\nOne live price: an Ozow link already open fixes the price");
    await call(admin, "PATCH", "/api/vouchers", { id: v20.json.id, active: true });
    await stack.sql.query(`DELETE FROM rate_limits`); // this test types more codes than the 10-per-15-min a person gets
    // Times passed from JS: this throwaway Postgres runs on local time, the app writes UTC.
    await stack.sql.query(
      `INSERT INTO payments (id, "requestId", amount, status, "providerPaymentId", "redirectUrl", "isTest", "createdAt", "updatedAt") VALUES ('pay_live', 'req1', 350, 'pending', 'ozow-live-1', 'https://pay.example/live', true, $1, $1)`,
      [new Date().toISOString().replace("Z", "")]
    );
    const locked = await call(null, "POST", "/api/public/voucher", { token: "token-1", code: code20 });
    check(locked.status === 409 && String(locked.json.error).includes("already started a payment"), "voucher can't be added while a R350 link is open", locked.json);
    // (The pay page and Pay both ask Ozow about an open link, and these keys are fake, so neither is checked here.)
    await stack.sql.query(`UPDATE payments SET status = 'failed' WHERE id = 'pay_live'`);
    check((await call(null, "POST", "/api/public/voucher", { token: "token-1", code: code20 })).status === 200, "once that link is dead, the voucher can be added");

    console.log("\nA voucher use is HELD when a link opens, and given back if it fails");
    const opened = await call(null, "POST", "/api/public/pay", { token: "token-1", expectedAmount: 280 });
    check(opened.status === 502, "Ozow (fake keys) refuses to open the R280 link", opened.status);
    check(Number((await one(`SELECT "usesCount" FROM vouchers WHERE code = $1`, [code20])).usesCount) === 0, "the held use was given back");
    const failedRow = await one(`SELECT status, amount::text, "voucherCode" FROM payments WHERE "requestId" = 'req1' AND "voucherCode" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`);
    check(failedRow?.status === "failed" && Number(failedRow?.amount) === 280 && failedRow?.voucherCode === code20, "attempt recorded: R280, voucher, failed", failedRow);
    // A row that never reached Ozow (server stopped mid-way) still holding a use:
    await stack.sql.query(`UPDATE vouchers SET "usesCount" = 1 WHERE code = $1`, [code20]);
    await stack.sql.query(
      `INSERT INTO payments (id, "requestId", amount, status, "voucherId", "createdAt", "updatedAt") VALUES ('pay_orphan', 'req1', 280, 'pending', $1, $2, $2)`,
      [v20.json.id, new Date(Date.now() - 2 * 3600_000).toISOString().replace("Z", "")]
    );
    await stack.sql.query(`DELETE FROM rate_limits`); // the pay page only asks again so often per link
    await call(null, "GET", "/pay/token-1");
    check((await one(`SELECT status FROM payments WHERE id = 'pay_orphan'`)).status === "failed", "an attempt that never reached Ozow is closed after an hour");
    check(Number((await one(`SELECT "usesCount" FROM vouchers WHERE code = $1`, [code20])).usesCount) === 0, "and its use is given back");
    const changed = await call(null, "POST", "/api/public/pay", { token: "token-1", expectedAmount: 350 });
    check(changed.json.kind === "price_changed", "page showed R350 but the voucher makes it R280: nothing opened, new price shown first", changed.json);

    console.log("\nCron sweep");
    check((await call(null, "GET", "/api/cron/payments-sweep")).status === 503, "no CRON_SECRET set: refuses to run (fails closed)");

    console.log("\nActivity log");
    const acts = (await stack.sql.query(`SELECT action FROM activity_log WHERE action LIKE 'voucher.%' OR action = 'payment.paid'`)).rows.map((r) => r.action);
    for (const a of ["voucher.create", "voucher.apply", "voucher.refused", "voucher.disable", "payment.paid"])
      check(acts.includes(a), `logged: ${a}`, acts);
  } catch (err) {
    fail++;
    console.error(err);
    console.log(stack?.appLog().slice(-3000));
  } finally {
    await stack?.stop();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
