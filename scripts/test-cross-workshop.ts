// ---------------------------------------------------------------------------
// Cross-workshop isolation, over real HTTP:
//
//   Workshop A's login creates one of every record a workshop owns. Workshop
//   B's login then tries to READ, UPDATE and DELETE each of them. Every one of
//   those attempts must answer 403 or 404, AND the record must be byte-for-byte
//   unchanged in the database afterwards: a 403 sent after the write happened
//   would still be a breach, so the status alone is not trusted.
//
// Positive controls run first: A must be able to read its own records, or a
// route that is simply broken would "pass" by refusing everyone.
//
// Runs against a throwaway local copy (scripts/lib/localStack.ts): a fresh
// Postgres with every migration, and `next dev` with every production secret
// blanked. Nothing touches the live database.
//
//   npm run test:cross-workshop
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";
import { startLocalStack, type LocalStack } from "./lib/localStack";

type Res = { status: number; body: unknown };
let stack: LocalStack;
let pass = 0;
let fail = 0;

function line(ok: boolean, text: string) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${text}`);
}

async function login(email: string, password: string): Promise<string> {
  const r = await fetch(`${stack.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = r.headers.get("set-cookie")?.match(/pmp_session=[^;]+/)?.[0];
  if (r.status !== 200 || !cookie) throw new Error(`login ${email} failed: ${r.status} ${await r.text()}`);
  return cookie;
}

async function call(cookie: string, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${stack.baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, body: parsed };
}

/** The record's row as stored, for before/after comparison. */
async function row(table: string, id: string): Promise<string | null> {
  const r = await stack.sql.query(`SELECT to_jsonb(t) AS j FROM "${table}" t WHERE id = $1`, [id]);
  return r.rows[0] ? JSON.stringify(r.rows[0].j) : null;
}

/**
 * One attempt by B on A's record: must be 403/404, and the row must be
 * exactly as it was before the attempt.
 */
async function attempt(
  label: string,
  table: string,
  id: string,
  doIt: () => Promise<Res>
) {
  const before = await row(table, id);
  const res = await doIt();
  const after = await row(table, id);
  const refused = res.status === 403 || res.status === 404;
  const untouched = before !== null && before === after;
  const why = !refused ? `got ${res.status} ${JSON.stringify(res.body).slice(0, 140)}` : !untouched ? "ROW CHANGED OR GONE" : "";
  line(refused && untouched, `${label.padEnd(66)} -> ${res.status}${why ? `   ${why}` : ""}`);
}

async function seed() {
  const now = new Date();
  const pw = await bcrypt.hash("Test-password-123", 10);
  await stack.sql.query(
    `INSERT INTO insurers (id, name, active, "createdAt", "updatedAt") VALUES ('ins_test', 'Test Insurer', true, $1, $1)`,
    [now]
  );
  for (const w of ["A", "B"]) {
    await stack.sql.query(
      `INSERT INTO panel_beaters (id, "companyName", "companyRegNumber", "physicalAddress", "rmiNumber", "updatedAt")
       VALUES ($1, $2, 'REG', '1 Test Road', 'RMI', $3)`,
      [`ws_${w}`, `Workshop ${w}`, now]
    );
    await stack.sql.query(
      `INSERT INTO users (id, name, email, "passwordHash", "roleId", "panelBeaterId", active,
                          "mustChangePassword", "emailVerifiedAt", "twoFactorEnabled", "updatedAt")
       VALUES ($1, $2, $3, $4, 'pb_admin', $5, true, false, $6, false, $6)`,
      [`user_${w}`, `Admin ${w}`, `admin-${w.toLowerCase()}@test.local`, pw, `ws_${w}`, now]
    );
  }
}

const line0 = {
  description: "Rear bumper",
  quantity: 1,
  partsAmount: 100,
  panelAmount: 0,
  panelHours: 0,
  paintAmount: 0,
  paintHours: 0,
  stripAmount: 0,
  stripHours: 0,
};
const walkIn = (name: string) => ({
  repairerQuote: true,
  firstName: name,
  lastName: "Client",
  email: `${name.toLowerCase()}@client.test`,
  phone: "0820000000",
  hasInsurance: "no",
  underWarranty: "no",
  isInsuranceClaim: "no",
  isThirdPartyClaim: "no",
  suspectedEngineDamage: "no",
});

async function main() {
  const t0 = Date.now();
  console.log("Starting a throwaway local copy of the app (fresh Postgres, every migration, no production secrets)...");
  stack = await startLocalStack({ log: (m) => console.log(`  ${m}`) });
  try {
    await seed();
    const A = await login("admin-a@test.local", "Test-password-123");
    const B = await login("admin-b@test.local", "Test-password-123");
    console.log("Signed in as Admin A (Workshop A) and Admin B (Workshop B).\n");

    // ---- A creates one of everything ---------------------------------------
    type Created = { id: string; reference: string; card: { id: string } };
    const created = async (what: string, r: Res, pick: (b: Created) => string) => {
      if (r.status !== 200) throw new Error(`A could not create ${what}: ${r.status} ${JSON.stringify(r.body)}`);
      return pick(r.body as Created);
    };
    const supplierId = await created("supplier", await call(A, "POST", "/api/my-suppliers", { name: "A's parts supplier" }), (b) => b.id);
    const contactId = await created("insurer contact", await call(A, "POST", "/api/insurers/contacts", { insurerId: "ins_test", name: "A's claims handler" }), (b) => b.id);
    const cardId = await created("rate card", await call(A, "POST", "/api/rate-cards", { kind: "cash", values: { out_of_warranty: { labour_rate: 450 } } }), (b) => b.card.id);
    const typeId = await created("custom rate type", await call(A, "POST", "/api/rate-cards/custom-types", { label: "A's rim repair", unit: "rand" }), (b) => b.id);
    const refA = await created("walk-in job", await call(A, "POST", "/api/requests", walkIn("Alice")), (b) => b.reference);
    const additionalId = await created("additional", await call(A, "POST", "/api/additionals", { reference: refA, reason: "Hidden damage", lines: [line0] }), (b) => b.id);
    const staffId = await created("user", await call(A, "POST", "/api/users", { name: "A Estimator", email: "estimator-a@test.local", password: "Another-password-123", role: "pb_estimator", sendEmail: false, mustChangePassword: false }), (b) => b.id);
    const jobRow = await stack.sql.query(`SELECT id FROM quote_requests WHERE reference = $1`, [refA]);
    const jobId: string = jobRow.rows[0].id;
    // B's own job, so B can try to re-file A's additional under a job B DOES own.
    const refB = await created("B's walk-in job", await call(B, "POST", "/api/requests", walkIn("Bob")), (b) => b.reference);
    console.log(`Workshop A created: supplier, insurer contact, rate card, custom rate, walk-in job ${refA}, additional, user.\n`);

    // ---- Positive controls: A can reach its own records ----------------------
    console.log("Control: Workshop A can read its own records (else the refusals below prove nothing)");
    const has = (r: Res, id: string) => r.status === 200 && JSON.stringify(r.body).includes(id);
    line(has(await call(A, "GET", "/api/my-suppliers"), supplierId), "A reads own supplier");
    line(has(await call(A, "GET", "/api/insurers/contacts?insurerId=ins_test"), contactId), "A reads own insurer contact");
    line(has(await call(A, "GET", "/api/rate-cards"), cardId), "A reads own rate card");
    line(has(await call(A, "GET", "/api/rate-cards/custom-types"), typeId), "A reads own custom rate type");
    line(has(await call(A, "GET", `/api/requests/${refA}`), refA), "A reads own job");
    line(has(await call(A, "GET", `/api/additionals?reference=${refA}`), additionalId), "A reads own additional");
    line(has(await call(A, "GET", "/api/users"), staffId), "A reads own user");
    // Naming your OWN workshop must still work: the refusals below are about
    // whose workshop is named, not about naming one at all.
    for (const p of ["/api/my-suppliers", "/api/rate-cards", "/api/rate-cards/custom-types"]) {
      const r = await call(B, "GET", `${p}?panelBeaterId=ws_B`);
      line(r.status === 200, `B reads its own ${p}?panelBeaterId=ws_B -> ${r.status}`);
    }

    // ---- B tries every record ------------------------------------------------
    const ws = "panelBeaterId=ws_A";
    console.log("\nSupplier (A's own supplier book)");
    await attempt(`READ   GET    /api/my-suppliers?${ws}`, "suppliers", supplierId, () => call(B, "GET", `/api/my-suppliers?${ws}`));
    await attempt("UPDATE PATCH  /api/my-suppliers {id, name}", "suppliers", supplierId, () => call(B, "PATCH", "/api/my-suppliers", { id: supplierId, name: "hijacked" }));
    await attempt("DELETE DELETE /api/my-suppliers {id}", "suppliers", supplierId, () => call(B, "DELETE", "/api/my-suppliers", { id: supplierId }));

    console.log("\nInsurer contact (A's private contact)");
    // The contacts route has no workshop parameter (a private contact is
    // always the caller's own), so this read is a list: judged on whether A's
    // private contact appears in what B gets for the same insurer.
    const contacts = await call(B, "GET", "/api/insurers/contacts?insurerId=ins_test");
    const contactLeaked = JSON.stringify(contacts.body).includes(contactId);
    line(!contactLeaked, `${"READ   GET    /api/insurers/contacts?insurerId= (list; must not contain A's)".padEnd(66)} -> ${contacts.status}${contactLeaked ? "   A'S CONTACT IS IN B'S LIST" : ", A's contact absent"}`);
    await attempt("UPDATE PATCH  /api/insurers/contacts {id, name}", "insurer_contacts", contactId, () => call(B, "PATCH", "/api/insurers/contacts", { id: contactId, name: "hijacked" }));
    await attempt("DELETE DELETE /api/insurers/contacts?id=", "insurer_contacts", contactId, () => call(B, "DELETE", `/api/insurers/contacts?id=${contactId}`));

    console.log("\nRate card");
    await attempt(`READ   GET    /api/rate-cards?${ws}`, "rate_cards", cardId, () => call(B, "GET", `/api/rate-cards?${ws}`));
    await attempt("UPDATE POST   /api/rate-cards {id: A's card, new rates}", "rate_cards", cardId, () => call(B, "POST", "/api/rate-cards", { id: cardId, kind: "insurance", insurerName: "Probe Insurer", values: { out_of_warranty: { labour_rate: 1 } } }));
    await attempt("DELETE DELETE /api/rate-cards?id=", "rate_cards", cardId, () => call(B, "DELETE", `/api/rate-cards?id=${cardId}`));

    console.log("\nCustom rate type (no update route exists)");
    await attempt(`READ   GET    /api/rate-cards/custom-types?${ws}`, "custom_rate_types", typeId, () => call(B, "GET", `/api/rate-cards/custom-types?${ws}`));
    await attempt(`DELETE DELETE /api/rate-cards/custom-types?id=&${ws}`, "custom_rate_types", typeId, () => call(B, "DELETE", `/api/rate-cards/custom-types?id=${typeId}&${ws}`));

    console.log("\nWalk-in job (no delete route exists)");
    await attempt("READ   GET    /api/requests/[A's reference]", "quote_requests", jobId, () => call(B, "GET", `/api/requests/${refA}`));
    await attempt("UPDATE PATCH  /api/requests/[A's reference] {status}", "quote_requests", jobId, () => call(B, "PATCH", `/api/requests/${refA}`, { status: "completed" }));
    await attempt("UPDATE PATCH  /api/requests/[A's reference] {panelBeaterIds:[B]}", "quote_requests", jobId, () => call(B, "PATCH", `/api/requests/${refA}`, { panelBeaterIds: ["ws_B"] }));
    await attempt("UPDATE POST   /api/quotes (quote A's job as Workshop A)", "quote_requests", jobId, () => call(B, "POST", "/api/quotes", { reference: refA, panelBeaterId: "ws_A", lines: [line0] }));
    await attempt("UPDATE POST   /api/quotes (quote A's job as Workshop B)", "quote_requests", jobId, () => call(B, "POST", "/api/quotes", { reference: refA, panelBeaterId: "ws_B", lines: [line0] }));

    console.log("\nAdditional (extra work on A's job)");
    await attempt("READ   GET    /api/additionals?reference=[A's job]", "additionals", additionalId, () => call(B, "GET", `/api/additionals?reference=${refA}`));
    await attempt("READ   GET    /api/additionals?reference=[A's job]&panelBeaterId=ws_A", "additionals", additionalId, () => call(B, "GET", `/api/additionals?reference=${refA}&${ws}`));
    await attempt("UPDATE POST   /api/additionals {id, reference: A's job}", "additionals", additionalId, () => call(B, "POST", "/api/additionals", { id: additionalId, reference: refA, reason: "hijacked", lines: [line0] }));
    await attempt("UPDATE POST   /api/additionals {id, reference: B's own job}", "additionals", additionalId, () => call(B, "POST", "/api/additionals", { id: additionalId, reference: refB, reason: "hijacked", lines: [line0] }));
    await attempt("UPDATE PATCH  /api/additionals {id, status: approved}", "additionals", additionalId, () => call(B, "PATCH", "/api/additionals", { id: additionalId, status: "approved" }));
    await attempt("UPDATE POST   /api/additionals/send {id, email}", "additionals", additionalId, () => call(B, "POST", "/api/additionals/send", { id: additionalId, email: "attacker@evil.test" }));
    await attempt("DELETE DELETE /api/additionals?id=", "additionals", additionalId, () => call(B, "DELETE", `/api/additionals?id=${additionalId}`));

    console.log("\nUser (A's estimator login)");
    // No route reads ONE user and /api/users takes no workshop parameter: B
    // may list B's own users. So this read is judged on whether A's user
    // shows up in B's list, and the real status is printed as it is.
    const list = await call(B, "GET", "/api/users");
    const leaked = JSON.stringify(list.body).includes(staffId);
    line(!leaked, `${"READ   GET    /api/users (list; must not contain A's user)".padEnd(66)} -> ${list.status}${leaked ? "   A'S USER IS IN B'S LIST" : ", A's user absent"}`);
    await attempt("UPDATE PATCH  /api/users {id, active:false}", "users", staffId, () => call(B, "PATCH", "/api/users", { id: staffId, active: false }));
    await attempt("UPDATE PATCH  /api/users {id, password} (take the login over)", "users", staffId, () => call(B, "PATCH", "/api/users", { id: staffId, password: "Takeover-password-1", sendEmail: false }));
    await attempt("DELETE DELETE /api/users?id=", "users", staffId, () => call(B, "DELETE", `/api/users?id=${staffId}`));
  } finally {
    if (fail) {
      const tail = stack?.appLog().split(/\r?\n/).filter((l) => /⨯|Error/.test(l)).slice(-15).join("\n");
      if (tail) console.log(`\nApp server errors seen:\n${tail}`);
    }
    await stack?.stop();
  }
  console.log(`\n${pass} passed, ${fail} failed   (${((Date.now() - t0) / 1000).toFixed(0)}s; local copy deleted)`);
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await stack?.stop();
  process.exit(1);
});
