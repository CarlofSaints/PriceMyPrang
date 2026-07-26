import { PrismaClient } from "./generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// ---------------------------------------------------------------------------
// Neon Postgres client.
//
// Prisma 7 talks to the database through a driver adapter; we use the
// WebSocket-based PrismaNeon (not PrismaNeonHttp) because the store relies on
// interactive transactions, which the HTTP adapter can't do.
//
// Instantiation is lazy. Next.js evaluates top-level module code at build time,
// and reading DATABASE_URL eagerly would crash `next build` on a deploy where
// the env var isn't set yet. Note: a plain lazy `let`, NOT a Proxy wrapper —
// Proxies break libraries that introspect the client.
// ---------------------------------------------------------------------------

let client: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon on the Vercel project (Storage → Neon), then `vercel env pull .env.local`."
    );
  }

  client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
  return client;
}
