import { PrismaClient } from "./generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Neon Postgres client.
//
// Prisma 7 talks to the database through a driver adapter; we use the
// WebSocket-based PrismaNeon (not PrismaNeonHttp) because the store relies on
// interactive transactions, which the HTTP adapter can't do.
//
// Instantiation is lazy. Next.js evaluates top-level module code at build time,
// and reading DATABASE_URL eagerly would crash `next build` on a deploy where
// the env var isn't set yet. Note: a plain lazy `let`, NOT a Proxy wrapper,
// because Proxies break libraries that introspect the client.
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

  pointAtLocalProxyIfAsked();
  client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });
  return client;
}

/**
 * LOCAL TEST STACK ONLY (scripts/lib/localStack.ts). The Neon driver speaks
 * Postgres over a WebSocket, so a plain local Postgres needs a small
 * WebSocket-to-TCP proxy in front of it; this points the driver at that proxy
 * instead of Neon (host:port, no scheme: the driver adds ws://). Off unless
 * PMP_LOCAL_WS_PROXY is set, and refused outright
 * on Vercel so a stray variable can never redirect a deployment.
 */
function pointAtLocalProxyIfAsked() {
  const proxy = process.env.PMP_LOCAL_WS_PROXY?.trim();
  if (!proxy) return;
  if (process.env.VERCEL) throw new Error("PMP_LOCAL_WS_PROXY is for local tests only and must not be set on Vercel");
  neonConfig.wsProxy = (host, port) => `${proxy}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineConnect = false;
  neonConfig.pipelineTLS = false;
}
