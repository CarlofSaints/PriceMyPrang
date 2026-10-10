import { readFileSync } from "fs";
import path from "path";
import { Pool } from "@neondatabase/serverless";

// Proves the row-level security set up by migration
// 20261010090000_rls_default_deny_and_powerbi_reader, by querying AS OTHER
// ROLES. Everything runs in ONE transaction that is ALWAYS rolled back: the
// probe role it creates and any grant it makes never persist.
//
//   npm run db:prove-rls              probe the database as it is now
//   npm run db:prove-rls -- --dry-run apply the migration inside the same
//                                     transaction first, probe, roll back
//
// --dry-run briefly locks every table (ALTER TABLE), so the live site waits
// for a second or two while it runs; lock_timeout stops it queueing behind a
// long query.
//
// tsx transforms to CJS here, so no top-level await: hence main().

const MIGRATION = path.join(
  __dirname,
  "../prisma/migrations/20261010090000_rls_default_deny_and_powerbi_reader/migration.sql"
);

type Check = { label: string; sql: string; expect: "rows>0" | "zero" | "denied" };

// "rows>0" checks need data in that table; every one listed here has some.
const AS_PROBE: Check[] = [
  { label: "users", sql: `select count(*)::int n from "users"`, expect: "zero" },
  { label: "quote_requests", sql: `select count(*)::int n from "quote_requests"`, expect: "zero" },
  { label: "panel_beaters", sql: `select count(*)::int n from "panel_beaters"`, expect: "zero" },
  { label: "integration_secrets", sql: `select count(*)::int n from "integration_secrets"`, expect: "zero" },
];

const AS_POWERBI: Check[] = [
  { label: "quote_requests (safe columns)", sql: `select count(reference)::int n from "quote_requests"`, expect: "rows>0" },
  { label: "reporting.users view", sql: `select count(*)::int n from reporting.users`, expect: "rows>0" },
  { label: "panel_beaters", sql: `select count(*)::int n from "panel_beaters"`, expect: "rows>0" },
  { label: "users.passwordHash", sql: `select "passwordHash" from "users" limit 1`, expect: "denied" },
  { label: "quote_requests.publicToken", sql: `select "publicToken" from "quote_requests" limit 1`, expect: "denied" },
  { label: "select * from users", sql: `select * from "users" limit 1`, expect: "denied" },
  { label: "integration_secrets", sql: `select count(*) from "integration_secrets"`, expect: "denied" },
  { label: "password_set_tokens", sql: `select count(*) from "password_set_tokens"`, expect: "denied" },
  { label: "login_challenges", sql: `select count(*) from "login_challenges"`, expect: "denied" },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let failures = 0;

  async function run(c: Check) {
    await client.query("savepoint probe");
    let got: string;
    try {
      const r = await client.query(c.sql);
      const n = r.rows[0]?.n;
      got = typeof n === "number" ? (n > 0 ? "rows>0" : "zero") : "rows>0";
      await client.query("release savepoint probe");
      const shown = typeof n === "number" ? `${n} rows` : "read";
      report(c, got, shown);
    } catch (err) {
      await client.query("rollback to savepoint probe");
      const msg = (err as Error).message;
      got = /permission denied/i.test(msg) ? "denied" : "error";
      report(c, got, got === "denied" ? "permission denied" : msg);
    }
  }

  function report(c: Check, got: string, shown: string) {
    const ok = got === c.expect;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label.padEnd(30)} ${shown.padEnd(18)} (expected ${c.expect})`);
  }

  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '3s'");
    if (dryRun) {
      console.log("Applying the migration inside the transaction (will roll back)...");
      await client.query(readFileSync(MIGRATION, "utf8"));
    }

    const me = (await client.query("select current_user u")).rows[0].u as string;

    console.log(`\nAs the app (${me}, BYPASSRLS): must still see everything`);
    for (const t of ["users", "quote_requests", "panel_beaters"]) {
      await run({ label: t, sql: `select count(*)::int n from "${t}"`, expect: "rows>0" });
    }

    // A role with SELECT on every table but NO policy: RLS must hand it nothing.
    await client.query("create role rls_probe nologin");
    await client.query("grant usage on schema public to rls_probe");
    await client.query("grant select on all tables in schema public to rls_probe");
    await client.query(`grant rls_probe to "${me}" with set true`);
    console.log("\nAs rls_probe (SELECT granted on every table, no policy): must see 0 rows");
    await client.query("set local role rls_probe");
    for (const c of AS_PROBE) await run(c);
    await client.query("reset role");

    await client.query(`grant powerbi_reader to "${me}" with set true`);
    console.log("\nAs powerbi_reader: reporting data yes, secrets never");
    await client.query("set local role powerbi_reader");
    for (const c of AS_POWERBI) await run(c);
    await client.query("reset role");
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }

  console.log(`\nRolled back: nothing persisted. ${failures ? `${failures} FAILED` : "All checks passed."}`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
