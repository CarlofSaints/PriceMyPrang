/** TEMP, READ-ONLY: what does live Neon know about this user + their email? */
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const email = "admin@macrites.co.za";

  const u = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  console.log("USER RECORD");
  if (!u) console.log("  none found for", email);
  else
    console.log(
      `  ${u.name} <${u.email}>\n  id ${u.id}\n  role ${u.role}  panelBeaterId ${u.panelBeaterId ?? "—"}\n` +
        `  active ${u.active}  mustChangePassword ${u.mustChangePassword}  emailVerified ${u.emailVerified ?? "—"}\n` +
        `  twoFactorEnabled ${u.twoFactorEnabled}\n  created ${u.createdAt.toISOString()}`
    );

  const pbs = await db.panelBeater.findMany({
    where: { OR: [{ companyName: { contains: "acrite", mode: "insensitive" } }, { tradingAs: { contains: "acrite", mode: "insensitive" } }] },
    select: { id: true, companyName: true, tradingAs: true, status: true, completedByEmail: true, ownerEmail: true, createdAt: true },
  });
  console.log("\nMATCHING PANEL BEATERS");
  for (const p of pbs)
    console.log(`  ${p.createdAt.toISOString().slice(0, 16)}  ${p.tradingAs || p.companyName}  ${p.status}  completedBy:${p.completedByEmail ?? "—"}  owner:${p.ownerEmail ?? "—"}  id ${p.id}`);

  const acts = await db.activityLog.findMany({
    where: { OR: [{ actorEmail: { equals: email, mode: "insensitive" } }, { summary: { contains: "Angie", mode: "insensitive" } }, { summary: { contains: "acrite", mode: "insensitive" } }, { action: { startsWith: "user." } }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`\nRELATED ACTIVITY ROWS: ${acts.length}`);
  for (const a of acts)
    console.log(`  ${a.createdAt.toISOString().slice(0, 16)}  ${a.action}  ${a.outcome}  ${a.summary}\n     ${JSON.stringify(a.detail)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
