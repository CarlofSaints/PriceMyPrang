/**
 * Populate the insurance-company list the quote form's dropdown reads from.
 *
 *   npm run db:seed-insurers            # add anything missing
 *   npm run db:seed-insurers -- --dry   # show what WOULD be added
 *
 * Additive and idempotent. Matching is case-insensitive on the name, so a
 * second run adds nothing, and an insurer an admin has renamed, deactivated or
 * added by hand is never touched. Nothing is ever deleted — saveInsurers()
 * would prune rows not in the list it is handed, so this uses upsertInsurer()
 * one at a time instead.
 */
import { getInsurers, upsertInsurer } from "../lib/store";
import { SA_INSURERS } from "../lib/insurers";
import type { InsuranceCompany } from "../lib/types";

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    // Decompose, then drop the combining marks, so "Clientèle" becomes
    // "clientele" rather than "cliente_le".
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `ins_${base || "insurer"}`;
}

async function main() {
  const dry = process.argv.includes("--dry");

  const existing = await getInsurers();
  const known = new Set(existing.map((i) => i.name.trim().toLowerCase()));
  console.log(`Insurers already in the database: ${existing.length}`);

  const missing = SA_INSURERS.filter((n) => !known.has(n.trim().toLowerCase()));

  if (missing.length === 0) {
    console.log("Nothing to add — every name in lib/insurers.ts is already there.");
    return;
  }

  console.log(`\n${missing.length} to add:`);
  for (const name of missing) console.log(`  + ${name}`);

  if (dry) {
    console.log("\n--dry: nothing written.");
    return;
  }

  const now = new Date().toISOString();
  for (const name of missing) {
    const insurer: InsuranceCompany = {
      id: slugId(name),
      name,
      active: true,
      createdAt: now,
    };
    await upsertInsurer(insurer);
  }

  const after = await getInsurers();
  console.log(`\nDone. ${existing.length} -> ${after.length} insurers.`);
  console.log("Manage them at /portal/admin/insurers.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
