// ---------------------------------------------------------------------------
// A small fixed-window rate limiter, shared by the endpoints an anonymous
// caller can reach.
//
// HONEST LIMITATION: this is in-memory, so on serverless it is per-instance
// rather than global — a determined attacker spread across enough cold starts
// gets more attempts than the numbers below suggest. It is here to stop casual
// credential stuffing, reference-walking and running up an API bill, not to be
// a security boundary on its own. Move to Upstash if that changes.
// ---------------------------------------------------------------------------

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Window>();

/** Stop the map growing without bound on a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets, for a Retry-After header. */
  retryAfter: number;
}

/**
 * @param key    what is being limited — scope it, e.g. `login:${ip}`.
 * @param limit  how many are allowed in the window.
 * @param windowMs length of the window.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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

/**
 * The caller's IP as far as we can tell. Vercel sets x-forwarded-for; the first
 * entry is the client. Falls back to a constant, which makes the limit global
 * rather than per-caller — degrading closed, not open.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** A 429 with Retry-After, so a well-behaved client can back off properly. */
export function tooManyRequests(retryAfter: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}
