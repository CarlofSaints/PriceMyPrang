import { neon } from "@neondatabase/serverless";

// Read-only. Fails (exit 1) while any public table has row-level security off,
// so a table added by a later migration can't quietly skip the default deny.
//
//   npm run db:check-rls
//
// tsx transforms to CJS here, so no top-level await: hence main().
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql.query(
    `select c.relname as name, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 1`
  )) as { name: string; rls: boolean }[];

  const off = rows.filter((r) => !r.rls);
  console.log(`${rows.length} public tables, ${rows.length - off.length} with RLS on.`);
  if (off.length) {
    console.error(`RLS is OFF on: ${off.map((r) => r.name).join(", ")}`);
    console.error("Add ENABLE ROW LEVEL SECURITY for them in a migration.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
