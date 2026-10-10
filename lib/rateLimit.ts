// ---------------------------------------------------------------------------
// Rate limits: every limit in the app, and the one counter they all share.
//
// WHERE THE COUNT LIVES. In Postgres (rate_limits), not instance memory.
// Vercel runs many instances and recycles them, so a per-instance count let a
// caller multiply every limit below by however many instances they landed on:
// the login limit was "8 tries" only on paper. One atomic upsert per check
// counts every instance's hits in the same row.
//
// IF THE DATABASE IS UNREACHABLE the check falls back to this instance's
// memory, which is the old behaviour: a weaker limit, never NO limit. A
// database outage must not be the moment the brakes come off.
//
// FIXED WINDOW: the first hit opens a window of `windowMs`; the (limit+1)th
// inside it is refused until the window ends. Simple, and the Retry-After it
// gives is exact.
// ---------------------------------------------------------------------------

import { getDb } from "@/lib/db";

export interface Limit {
  /** Prefix of the bucket key: the bucket is `${prefix}:${id}`. */
  prefix: string;
  limit: number;
  windowMs: number;
  /** What the id is, for the record: who or what is being counted. */
  per: "ip" | "account" | "user" | "token" | "everyone";
  /** What the caller is told when refused. */
  message: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const WAIT = "Too many attempts. Please wait a few minutes and try again.";

/**
 * EVERY LIMIT, IN ONE PLACE. Generous enough that a real person never meets
 * one: each is sized against what the screen legitimately does, with room for
 * retries. Paid calls: Anthropic (disc / odometer reading), Google Geocoding,
 * Ozow (payments), Resend (every email), Vercel Blob (uploads).
 */
export const LIMITS = {
  // ---- Signing in ---------------------------------------------------------
  /** Password spraying: one password tried across many accounts. */
  loginIp: { prefix: "login-ip", limit: 30, windowMs: 15 * MIN, per: "ip", message: "Too many sign-in attempts. Please try again shortly." },
  /** Password guessing against one account, from any number of IPs. */
  loginAccount: { prefix: "login-acct", limit: 8, windowMs: 15 * MIN, per: "account", message: "Too many sign-in attempts for this account. Please wait a few minutes and try again." },
  /** The emailed sign-in code: a 6-digit code must not be guessable by volume. */
  verifyOtp: { prefix: "otp", limit: 20, windowMs: 15 * MIN, per: "ip", message: "Too many attempts. Please wait a few minutes." },
  /** Email verification, including "send it again" (Resend). */
  verifyEmail: { prefix: "verify-email", limit: 10, windowMs: 15 * MIN, per: "ip", message: "Too many attempts. Please wait a few minutes." },
  /** A signed-in user guessing their own current password. */
  changePassword: { prefix: "change-password", limit: 10, windowMs: 15 * MIN, per: "user", message: WAIT },

  // ---- Password reset -----------------------------------------------------
  /** Resend: one IP asking for reset emails to many addresses. */
  forgotIp: { prefix: "forgot", limit: 10, windowMs: HOUR, per: "ip", message: "Too many attempts. Try again a bit later." },
  /** Resend: one inbox flooded with reset emails from many IPs. */
  forgotEmail: { prefix: "forgot-email", limit: 4, windowMs: HOUR, per: "account", message: "We've already sent a few of these. Check your inbox and spam folder." },
  /** Setting a password from an emailed link. */
  setPassword: { prefix: "set-password", limit: 10, windowMs: MIN, per: "ip", message: "Too many attempts. Wait a minute and try again." },

  // ---- Signing up ---------------------------------------------------------
  /** Workshop application: Google Geocoding + three emails each. */
  registerWorkshop: { prefix: "register", limit: 5, windowMs: HOUR, per: "ip", message: "Too many applications from this connection. Please try again later." },
  /** Consumer quote request: Google Geocoding, an Ozow payment, emails. */
  quoteRequest: { prefix: "quote-request", limit: 10, windowMs: HOUR, per: "ip", message: "Too many quote requests from this connection. Please try again later." },
  /** Walk-in quote a workshop captures for a client in the portal. */
  quoteRequestRepairer: { prefix: "quote-request-user", limit: 60, windowMs: HOUR, per: "user", message: "Too many requests captured in the last hour. Please try again shortly." },

  // ---- Anthropic (the most expensive call we make) -------------------------
  /** Licence disc photo read. A customer reads one disc, maybe retries. */
  discRead: { prefix: "disc-read", limit: 15, windowMs: 10 * MIN, per: "ip", message: "Too many attempts. Please wait a few minutes, or type the details in." },
  /** Odometer photo read. */
  odometerRead: { prefix: "odo-read", limit: 15, windowMs: 10 * MIN, per: "ip", message: "Too many attempts. Please wait a few minutes, or type the mileage in." },
  /**
   * Both readers, ALL callers together: the ceiling on the bill if someone
   * spreads the work across many IPs. ~10x a busy hour of real requests.
   */
  aiReadsEveryone: { prefix: "ai-reads", limit: 300, windowMs: HOUR, per: "everyone", message: "Photo reading is busy right now. Please type the details in." },

  // ---- Google Geocoding ---------------------------------------------------
  /** "Get coordinates" on the public Join form, no login. */
  geocodeAnon: { prefix: "geocode-ip", limit: 10, windowMs: MIN, per: "ip", message: "Too many lookups" },
  /** "Get coordinates" in the portal. */
  geocodeUser: { prefix: "geocode-user", limit: 60, windowMs: 10 * MIN, per: "user", message: "Too many lookups" },

  // ---- Ozow ---------------------------------------------------------------
  /** Pay button: opens (or reuses) an Ozow payment. */
  pay: { prefix: "pay", limit: 10, windowMs: MIN, per: "ip", message: "Too many attempts. Please wait a minute and try again." },
  /**
   * The pay page asks Ozow's status API on every load. A refresh loop on one
   * link must not become a loop on Ozow's API.
   */
  payPageCheck: { prefix: "pay-page", limit: 30, windowMs: MIN, per: "token", message: "" },

  // ---- Resend (emails a member of the public can trigger) -------------------
  /** "Email me my feedback link": also stops walking the reference space. */
  feedbackLink: { prefix: "feedback-link", limit: 5, windowMs: MIN, per: "ip", message: "Too many attempts. Please wait a minute and try again." },
  /** Rating / complaint submission (emails the workshop and us). */
  feedbackSubmit: { prefix: "feedback", limit: 20, windowMs: 15 * MIN, per: "ip", message: "Too many submissions. Please wait a few minutes." },
  /** Signing the repairer agreement (emails a signed copy). */
  agreementSign: { prefix: "agreement-sign", limit: 10, windowMs: 15 * MIN, per: "ip", message: WAIT },
  /** Upload-failure reports (logged, emailed to us). */
  uploadFailed: { prefix: "upload-failed", limit: 20, windowMs: MIN, per: "ip", message: "Too many reports." },

  // ---- Vercel Blob --------------------------------------------------------
  /** Anonymous upload tokens: disc, odometer, photos, video, logos. */
  uploadAnon: { prefix: "upload-ip", limit: 100, windowMs: 15 * MIN, per: "ip", message: "Too many uploads. Please wait a few minutes and try again." },
  /** Dev-ticket attachments (staff). */
  uploadDevTicket: { prefix: "upload-dev", limit: 60, windowMs: 15 * MIN, per: "user", message: "Too many uploads. Please wait a few minutes and try again." },

  // ---- Resend (emails a signed-in user triggers) ----------------------------
  /** Building a quote: renders a PDF, emails the client. */
  buildQuote: { prefix: "quote-build", limit: 60, windowMs: HOUR, per: "user", message: "Too many quotes saved in the last hour. Please try again shortly." },
  /** Sending additionals to the insurer and client. */
  sendAdditionals: { prefix: "additionals-send", limit: 30, windowMs: HOUR, per: "user", message: "Too many sends in the last hour. Please try again shortly." },
  /** Assigning workshops to a job (emails each workshop). */
  assignJob: { prefix: "assign-job", limit: 60, windowMs: HOUR, per: "user", message: "Too many changes in the last hour. Please try again shortly." },
  /** Creating users / sending welcome and reset emails. */
  userEmails: { prefix: "user-admin", limit: 30, windowMs: HOUR, per: "user", message: "Too many user changes in the last hour. Please try again shortly." },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets, for a Retry-After header. */
  retryAfter: number;
}

// ---- Fallback: this instance's memory ---------------------------------------

type Window = { count: number; resetAt: number };
const buckets = new Map<string, Window>();

/** Stop the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}

export function memoryHit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const cur = buckets.get(key);
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  cur.count += 1;
  if (cur.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// ---- The shared counter -------------------------------------------------------

/** Anything that can run a parameterised query: the client, or a transaction (tests). */
export interface SqlRunner {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Count one hit in Postgres. ONE statement, so two instances hitting the same
 * key at once serialise on the row instead of both reading "7" and both
 * writing "8". An expired window restarts at 1 in the same statement.
 */
export async function dbHit(db: SqlRunner, key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<{ count: number; secs: number }[]>`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + ${windowMs}::int * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."resetAt" <= now() THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE WHEN "rate_limits"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "rate_limits"."resetAt" END
    RETURNING "count", EXTRACT(EPOCH FROM ("resetAt" - now()))::float8 AS secs`;
  const row = rows[0];
  if (!row) throw new Error("rate limit upsert returned no row");
  // Capped at the window: the column keeps milliseconds, so rounding can
  // otherwise report 61 s on a 60 s window.
  const secs = Math.min(Math.ceil(Number(row.secs)), Math.ceil(windowMs / 1000));
  if (Number(row.count) > limit) return { ok: false, retryAfter: Math.max(1, secs) };
  return { ok: true, retryAfter: 0 };
}

let warned = false;

/**
 * Count a hit against a named limit. `id` is whatever the limit is per: an
 * IP, a lower-cased email, a user id, a token. Omit it for a limit on
 * everyone together.
 */
export async function hit(name: LimitName, id = "all"): Promise<RateLimitResult> {
  const l: Limit = LIMITS[name];
  const key = `${l.prefix}:${id}`;
  try {
    const result = await dbHit(getDb(), key, l.limit, l.windowMs);
    // Expired rows are dead weight. Clearing them on ~1 check in 200 keeps
    // the table small without a cron.
    if (Math.random() < 0.005) {
      await getDb()
        .$executeRaw`DELETE FROM "rate_limits" WHERE "resetAt" < now() - interval '1 hour'`
        .catch(() => {});
    }
    return result;
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn("rate limit: shared counter unavailable, using this instance's memory", err);
    }
    return memoryHit(key, l.limit, l.windowMs);
  }
}

/**
 * The usual check: null when allowed, else the 429 to return. For routes that
 * don't need to log or branch on a refusal.
 */
export async function limitOrRespond(name: LimitName, id?: string): Promise<Response | null> {
  const r = await hit(name, id);
  return r.ok ? null : tooManyRequests(r.retryAfter, LIMITS[name].message);
}

/**
 * The caller's IP as far as we can tell. Vercel sets x-forwarded-for; the first
 * entry is the client. Falls back to a constant, which makes the limit global
 * rather than per-caller: degrading closed, not open.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/**
 * The refusal every limited route returns: 429, a JSON `error` the screen
 * shows as-is, and Retry-After in seconds so a well-behaved client backs off.
 */
export function tooManyRequests(retryAfter: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}
