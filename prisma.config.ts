import "dotenv/config";
import { defineConfig } from "prisma/config";

// ---------------------------------------------------------------------------
// CLI-only configuration (migrate / db pull / studio). The running app does NOT
// read this — it connects through the Neon adapter in lib/db.ts.
//
// Migrations must run over a DIRECT (unpooled) connection: PgBouncer can't hold
// the session state DDL needs. Neon's Vercel integration injects both, with the
// unpooled one as DATABASE_URL_UNPOOLED.
// ---------------------------------------------------------------------------

const directUrl =
  process.env["DATABASE_URL_UNPOOLED"] ??
  process.env["DIRECT_URL"] ??
  process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: directUrl,
  },
});
