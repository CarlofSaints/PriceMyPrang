import { getDb } from "../lib/db";

// Read-only check that the activity log is actually recording against the LIVE
// database. Writes nothing, changes nothing.
//
//   npx dotenv -e .env.local -- npx tsx scripts/check-activity-log.ts
//
// tsx transforms to CJS here, so no top-level await — hence main().
async function main() {
  const db = getDb();

  const total = await db.activityLog.count();
  console.log(`activity_log rows: ${total}`);

  if (total === 0) {
    console.log("\nNothing recorded yet. Sign in on the live site and run this again.");
    return;
  }

  const byAction = await db.activityLog.groupBy({
    by: ["action", "outcome"],
    _count: { _all: true },
  });
  console.log("\nBy action:");
  for (const r of byAction.sort((a, b) => a.action.localeCompare(b.action))) {
    console.log(`  ${r.action.padEnd(32)} ${r.outcome.padEnd(8)} ${r._count._all}`);
  }

  const latest = await db.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log("\nMost recent:");
  for (const r of latest) {
    const when = r.createdAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
    console.log(`  ${when}  [${r.outcome}] ${r.summary}`);
  }

  // The whole point of the redaction rules: prove no credential reached the
  // table. Scans every detail blob for anything that looks like a live secret.
  const withDetail = await db.activityLog.findMany({
    where: { detail: { not: undefined } },
    select: { id: true, action: true, detail: true },
  });
  const suspicious = withDetail.filter((r) => {
    const s = JSON.stringify(r.detail ?? {});
    return (
      /"(password|passwordHash|secret|token|apiKey|api_key|otp|ciphertext|authTag)"\s*:\s*"(?!\[redacted\])/i.test(
        s
      ) || /vercel_blob_rw_|sk-ant-/.test(s)
    );
  });
  console.log(
    `\nRedaction check: scanned ${withDetail.length} detail blobs, ${suspicious.length} suspicious`
  );
  for (const r of suspicious) console.log(`  !! ${r.action} (${r.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
