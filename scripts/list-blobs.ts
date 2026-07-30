/**
 * Show what is actually in the Blob store. READ-ONLY — deletes nothing.
 *
 *   npm run blob:list                  # everything, grouped by top-level folder
 *   npm run blob:list -- --prefix data/    # just the suspected dead JSON
 *
 * Needs a real BLOB_READ_WRITE_TOKEN in .env.local. The project's copy of that
 * variable is marked Sensitive in Vercel, so `vercel env pull` writes an empty
 * string for it — copy the value from the Blob STORE's page in the dashboard
 * instead (Storage -> your store -> the .env.local / Connect snippet).
 *
 * Deleting is a separate, deliberate step: media for live quotes lives in the
 * same store as the legacy data/*.json files, so nothing here guesses at what
 * is safe to remove.
 */
import { list } from "@vercel/blob";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const kb = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "BLOB_READ_WRITE_TOKEN is empty.\n\n" +
        "The project env var is Sensitive, so `vercel env pull` cannot read it back.\n" +
        "Copy the token from the Blob store's own page in the Vercel dashboard\n" +
        "(Storage -> your store -> .env.local / Connect) into .env.local, then re-run."
    );
    process.exit(1);
  }

  const prefix = arg("prefix");
  const blobs: { pathname: string; size: number; uploadedAt: Date }[] = [];

  // The API pages at 1000; a store with a few thousand photos needs the loop.
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (blobs.length === 0) {
    console.log(prefix ? `Nothing under "${prefix}".` : "The store is empty.");
    return;
  }

  // Group by first path segment, so "is data/ still there?" is answerable at a
  // glance without reading a few thousand lines.
  const groups = new Map<string, { count: number; bytes: number }>();
  for (const b of blobs) {
    const key = b.pathname.includes("/") ? `${b.pathname.split("/")[0]}/` : "(root)";
    const g = groups.get(key) ?? { count: 0, bytes: 0 };
    g.count++;
    g.bytes += b.size;
    groups.set(key, g);
  }

  console.log(`${blobs.length} blobs, ${kb(blobs.reduce((t, b) => t + b.size, 0))} total\n`);
  console.log("BY FOLDER");
  for (const [name, g] of [...groups].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${name.padEnd(20)} ${String(g.count).padStart(5)} files   ${kb(g.bytes)}`);
  }

  // Full listing only when narrowed, otherwise this drowns the terminal.
  if (prefix) {
    console.log(`\nFILES UNDER "${prefix}"`);
    for (const b of [...blobs].sort((a, b) => a.pathname.localeCompare(b.pathname))) {
      console.log(
        `  ${b.pathname.padEnd(60)} ${kb(b.size).padStart(10)}  ${new Date(b.uploadedAt)
          .toISOString()
          .slice(0, 10)}`
      );
    }
    console.log("\nNothing has been deleted. Review this list before anything is removed.");
  } else {
    console.log('\nRe-run with --prefix data/ to see individual files in a folder.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Listing failed:", err);
    process.exit(1);
  });
