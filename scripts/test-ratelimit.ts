// Rate limits (lib/rateLimit.ts).
//   npm run test:ratelimit                 pure checks + route wiring
//   npm run test:ratelimit -- --db         also the shared Postgres counter, run
//                                          inside a transaction that is ALWAYS
//                                          rolled back: nothing persists.
import fs from "node:fs";
import path from "node:path";
import { LIMITS, memoryHit, dbHit, tooManyRequests, type LimitName, type SqlRunner } from "../lib/rateLimit";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`);
}

async function main() {
  console.log("\nThe refusal");
  const r = tooManyRequests(42, "Slow down");
  check("status 429", r.status === 429, r.status);
  check("Retry-After in seconds", r.headers.get("Retry-After") === "42", r.headers.get("Retry-After"));
  check("JSON { error }", JSON.stringify(await r.json()) === JSON.stringify({ error: "Slow down" }));

  console.log("\nMemory fallback counter");
  const k = `t-${Date.now()}`;
  const seen = Array.from({ length: 4 }, () => memoryHit(k, 3, 60_000).ok);
  check("3 allowed, 4th refused", JSON.stringify(seen) === "[true,true,true,false]", seen);
  const refused = memoryHit(k, 3, 60_000);
  check("refusal carries retryAfter 1..60", refused.retryAfter >= 1 && refused.retryAfter <= 60, refused.retryAfter);
  check("other keys unaffected", memoryHit(k + "x", 3, 60_000).ok);

  console.log("\nEvery limit is sane");
  for (const [name, l] of Object.entries(LIMITS)) {
    const ok = l.limit > 0 && l.windowMs >= 60_000 && l.prefix.length > 0 && (name === "payPageCheck" || l.message.length > 0);
    check(`${name}: ${l.limit} per ${l.windowMs / 60_000} min per ${l.per}`, ok, l);
  }
  const prefixes = Object.values(LIMITS).map((l) => l.prefix);
  check("no two limits share a bucket prefix", new Set(prefixes).size === prefixes.length, prefixes);

  // Each route must still call the limit it is meant to. A refactor that drops
  // the line fails here rather than silently opening the route.
  console.log("\nRoutes call their limits");
  const expect: Record<string, LimitName[]> = {
    "app/api/auth/login/route.ts": ["loginIp", "loginAccount"],
    "app/api/auth/verify-otp/route.ts": ["verifyOtp"],
    "app/api/auth/verify-email/route.ts": ["verifyEmail"],
    "app/api/auth/change-password/route.ts": ["changePassword"],
    "app/api/public/forgot-password/route.ts": ["forgotIp", "forgotEmail"],
    "app/api/public/set-password/route.ts": ["setPassword"],
    "app/api/panel-beaters/register/route.ts": ["registerWorkshop"],
    "app/api/requests/route.ts": ["quoteRequest", "quoteRequestRepairer"],
    "app/api/disc/read/route.ts": ["discRead", "aiReadsEveryone"],
    "app/api/odometer/read/route.ts": ["odometerRead", "aiReadsEveryone"],
    "app/api/panel-beaters/geocode/route.ts": ["geocodeAnon", "geocodeUser"],
    "app/api/public/pay/route.ts": ["pay"],
    "app/pay/[token]/page.tsx": ["payPageCheck"],
    "app/api/public/feedback/request-link/route.ts": ["feedbackLink"],
    "app/api/public/feedback/[token]/route.ts": ["feedbackSubmit"],
    "app/api/public/agreement/sign/route.ts": ["agreementSign"],
    "app/api/media/upload-failed/route.ts": ["uploadFailed"],
    "app/api/media/upload/route.ts": ["uploadAnon"],
    "app/api/dev-tickets/upload/route.ts": ["uploadDevTicket"],
    "app/api/quotes/route.ts": ["buildQuote"],
    "app/api/additionals/send/route.ts": ["sendAdditionals"],
    "app/api/requests/[reference]/route.ts": ["assignJob"],
    "app/api/users/route.ts": ["userEmails"],
  };
  const used = new Set<string>();
  for (const [file, names] of Object.entries(expect)) {
    const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    for (const n of names) {
      used.add(n);
      check(`${file} -> ${n}`, src.includes(`"${n}"`));
    }
  }
  for (const n of Object.keys(LIMITS)) check(`limit ${n} is used by a route`, used.has(n));

  if (process.argv.includes("--db")) await dbChecks();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

class Rollback extends Error {}

async function dbChecks() {
  console.log("\nShared Postgres counter (rolled back)");
  const { getDb } = await import("../lib/db");
  try {
    await getDb().$transaction(async (tx) => {
      // The migration's table, made inside this transaction so the check runs
      // whether or not the migration has reached this database yet.
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "rate_limits" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "resetAt" TIMESTAMPTZ(3) NOT NULL) ON COMMIT DROP`);
      const db = tx as unknown as SqlRunner;
      const seen: boolean[] = [];
      for (let i = 0; i < 4; i++) seen.push((await dbHit(db, "probe:a", 3, 60_000)).ok);
      check("db: 3 allowed, 4th refused", JSON.stringify(seen) === "[true,true,true,false]", seen);
      const refused = await dbHit(db, "probe:a", 3, 60_000);
      check("db: retryAfter 1..60 s", refused.retryAfter >= 1 && refused.retryAfter <= 60, refused.retryAfter);
      check("db: separate key, separate count", (await dbHit(db, "probe:b", 3, 60_000)).ok);
      await tx.$executeRawUnsafe(`UPDATE "rate_limits" SET "resetAt" = now() - interval '1 second' WHERE "key" = 'probe:a'`);
      check("db: expired window restarts at 1", (await dbHit(db, "probe:a", 3, 60_000)).ok);
      const rows = await tx.$queryRawUnsafe<{ count: number }[]>(`SELECT "count" FROM "rate_limits" WHERE "key" = 'probe:a'`);
      check("db: count reset to 1", Number(rows[0]?.count) === 1, rows);
      throw new Rollback();
    }, { maxWait: 30_000, timeout: 60_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log("  rolled back: nothing persisted");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
