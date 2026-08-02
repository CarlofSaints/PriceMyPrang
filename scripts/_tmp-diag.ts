import { getDb } from "../lib/db";
async function main() {
  const db = getDb();
  const pbs = await db.panelBeater.findMany({
    select: { id: true, companyName: true, status: true, ownerEmail: true, completedByEmail: true,
              submittedByPublic: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" }, take: 5,
  });
  console.log("PANEL BEATERS:");
  for (const p of pbs) console.log(`  ${p.companyName} | status=${p.status} | public=${p.submittedByPublic} | owner=${p.ownerEmail} | completedBy=${p.completedByEmail} | created=${p.createdAt.toISOString().slice(0,16)} updated=${p.updatedAt.toISOString().slice(0,16)}`);

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, roleId: true, panelBeaterId: true, active: true,
              mustChangePassword: true, createdAt: true, updatedAt: true, passwordHash: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("\nUSERS:");
  for (const u of users)
    console.log(`  ${u.email.padEnd(34)} role=${String(u.roleId).padEnd(13)} pb=${u.panelBeaterId ? u.panelBeaterId.slice(0,8) : "-"} active=${u.active} mustChange=${u.mustChangePassword} hash=${u.passwordHash.slice(0,7)}… created=${u.createdAt.toISOString().slice(0,16)} updated=${u.updatedAt.toISOString().slice(0,16)}`);
}
main();
