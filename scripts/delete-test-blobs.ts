/**
 * Remove ONLY the throwaway files left behind by testing the certificate
 * upload on 12 Aug 2026. Nothing else is touchable by this script.
 *
 *   npm run blob:clean-tests          # lists what it WOULD delete, deletes nothing
 *   npm run blob:clean-tests -- --yes # actually deletes
 *
 * Needs a real BLOB_READ_WRITE_TOKEN in .env.local — the project's copy is
 * marked Sensitive, so `vercel env pull` writes an empty string. Copy it from
 * the Blob store's own page instead (Storage -> your store -> Connect).
 *
 * Safety: a blob is deletable here only if it is under
 * panel-beaters/certificates/ AND its name says it is a test. Real certificates
 * live in the same folder, so the name test is what protects them — it is
 * deliberately narrow rather than clever. Dry run is the default.
 */
import { list, del } from "@vercel/blob";

const FOLDER = "panel-beaters/certificates/";

// The marker every test file carries, plus the ONE stray from the first probe,
// which was uploaded before the marker convention existed. Named in full so it
// cannot match anything else.
const TEST_MARKER = "TEST-DELETE-ME";
const STRAY = "1786527547972-warranty-cert-zGEiDUAYu7B1MQaVrkYOjWEaqWLfOJ.png";

function isTestFile(pathname: string): boolean {
  if (!pathname.startsWith(FOLDER)) return false;
  const name = pathname.slice(FOLDER.length);
  return name.includes(TEST_MARKER) || name === STRAY;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "BLOB_READ_WRITE_TOKEN is empty.\n\n" +
        "Copy the token from the Blob store's page in the Vercel dashboard\n" +
        "(Storage -> your store -> .env.local / Connect) into .env.local, then re-run."
    );
    process.exit(1);
  }

  const confirmed = process.argv.includes("--yes");

  const all: { pathname: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: FOLDER, cursor, limit: 1000 });
    all.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const doomed = all.filter((b) => isTestFile(b.pathname));
  const keeping = all.length - doomed.length;

  if (doomed.length === 0) {
    console.log(`Nothing to clean. ${keeping} real certificate(s) in ${FOLDER}.`);
    return;
  }

  console.log(`${doomed.length} test file(s) to remove; ${keeping} real certificate(s) left alone.\n`);
  for (const b of doomed) console.log(`  ${b.pathname}  (${b.size} B)`);

  if (!confirmed) {
    console.log("\nDry run — nothing deleted. Re-run with -- --yes to delete these.");
    return;
  }

  for (const b of doomed) {
    await del(b.pathname);
    console.log(`deleted ${b.pathname}`);
  }
  console.log(`\nDone. ${doomed.length} removed, ${keeping} certificate(s) untouched.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
