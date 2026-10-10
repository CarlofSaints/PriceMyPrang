// ---------------------------------------------------------------------------
// A throwaway copy of the whole app on this machine, for tests that need real
// HTTP against real routes without going anywhere near production:
//
//   1. a fresh local Postgres (embedded-postgres) in a temp folder,
//   2. every migration applied to it (prisma migrate deploy),
//   3. a WebSocket-to-TCP proxy, because the app's Neon driver only speaks
//      Postgres over a WebSocket (lib/db.ts, PMP_LOCAL_WS_PROXY),
//   4. `next dev` on a spare port.
//
// ISOLATION. Next would fill any unset variable from .env / .env.local, which
// hold PRODUCTION secrets (database, Blob, Resend, Ozow, Anthropic). So every
// key found in those files is passed to the children as "" (Next only fills a
// variable that is undefined), and only the few this stack needs are set.
// Nothing here can reach the live database, send an email or take a payment.
// Everything is deleted on stop().
// ---------------------------------------------------------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import EmbeddedPostgres from "embedded-postgres";
import { WebSocketServer } from "ws";
import pg from "pg";

const ROOT = process.cwd();

export interface LocalStack {
  baseUrl: string;
  /** Plain pg client on the test database, for seeding and inspecting rows. */
  sql: pg.Client;
  /** The app server's console so far: where a 500's real error is. */
  appLog(): string;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

/** Every variable named in .env and .env.local, blanked. */
function blankedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) out[m[1]] = "";
    }
  }
  return out;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, env, shell: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(" ")} failed:\n${out}`))));
  });
}

/** Postgres-over-WebSocket, the way Neon's own wsproxy does it. */
function startWsProxy(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port, host: "127.0.0.1" });
  wss.on("connection", (ws, req) => {
    const address = new URL(req.url ?? "", "http://x").searchParams.get("address") ?? "";
    const [host, p] = address.split(":");
    const tcp = net.connect(Number(p), host === "localhost" ? "127.0.0.1" : host);
    tcp.on("data", (d) => ws.readyState === ws.OPEN && ws.send(d));
    ws.on("message", (d) => tcp.write(d as Buffer));
    const close = () => {
      tcp.destroy();
      ws.close();
    };
    tcp.on("close", close);
    tcp.on("error", close);
    ws.on("close", close);
    ws.on("error", close);
  });
  return wss;
}

async function waitForHttp(url: string, child: ChildProcess, log: () => string, ms = 180_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`next dev exited early:\n${log()}`);
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next dev never answered ${url}:\n${log()}`);
}

export async function startLocalStack(opts: { log?: (s: string) => void } = {}): Promise<LocalStack> {
  const say = opts.log ?? (() => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pmp-stack-"));
  const [pgPort, wsPort, appPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const password = crypto.randomBytes(12).toString("hex");

  say(`postgres: starting on :${pgPort}`);
  const pgServer = new EmbeddedPostgres({
    databaseDir: path.join(dir, "pgdata"),
    user: "postgres",
    password,
    port: pgPort,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pgServer.initialise();
  await pgServer.start();
  await pgServer.createDatabase("pmp");
  const url = `postgresql://postgres:${password}@localhost:${pgPort}/pmp`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...blankedEnv(),
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    PMP_LOCAL_WS_PROXY: `127.0.0.1:${wsPort}`,
    SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
    NEXT_PUBLIC_APP_URL: `http://localhost:${appPort}`,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // BLANK, not deleted: a deleted variable is undefined, and Next would refill
  // it from .env.local (vercel env pull writes VERCEL="1" there).
  env.VERCEL = "";
  delete (env as Record<string, string | undefined>).NODE_ENV;

  say("postgres: applying every migration");
  await run("npx", ["prisma", "migrate", "deploy"], env);

  const wss = startWsProxy(wsPort);

  say(`app: next dev on :${appPort} (first compile takes a while)`);
  let appLog = "";
  const app = spawn("npx", ["next", "dev", "-p", String(appPort)], { cwd: ROOT, env, shell: true });
  app.stdout?.on("data", (d) => (appLog += d));
  app.stderr?.on("data", (d) => (appLog += d));
  const baseUrl = `http://localhost:${appPort}`;
  await waitForHttp(`${baseUrl}/login`, app, () => appLog.slice(-4000));

  const sql = new pg.Client({ connectionString: url });
  await sql.connect();

  let stopped = false;
  return {
    baseUrl,
    sql,
    appLog: () => appLog,
    async stop() {
      if (stopped) return;
      stopped = true;
      await sql.end().catch(() => {});
      // shell:true means the pid is the shell; take the whole tree down.
      if (app.pid) {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"]);
        else app.kill("SIGTERM");
      }
      wss.close();
      await pgServer.stop().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
