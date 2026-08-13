import { getDb } from "./db";
import type { AuthUser } from "./types";

// ---------------------------------------------------------------------------
// The activity log.
//
// Every meaningful thing anyone does on the site lands here: signing in,
// creating a user, submitting the consumer form, building a quote, sending an
// additional to an insurer, changing a rate, revealing an API key. Refusals and
// failures are recorded too — a log of successes only can't answer "who kept
// trying to get in".
//
// THREE RULES, in order of importance:
//
//  1. LOGGING MUST NEVER BREAK THE THING BEING LOGGED. Every write is wrapped;
//     a failure is swallowed to the console. Losing a log line is a nuisance,
//     losing somebody's quote because the log table was busy is not acceptable.
//
//  2. NEVER LOG A CREDENTIAL. Passwords, API keys, OTP codes and the sealed
//     imagin8 secret all pass through routes that are logged. redact() strips
//     them by key name, and the callers pass field NAMES rather than values
//     wherever a value would be sensitive.
//
//  3. THE ROW IS APPEND-ONLY. Nothing updates or deletes one, and no API can.
//
// The countable dimensions are real columns (see the model comment) because
// this table is meant to be charted later — the stats work is a query over
// action / actorId / outcome / createdAt, with no JSON parsing.
// ---------------------------------------------------------------------------

export type ActivityOutcome = "success" | "denied" | "failed";
export type ActorKind = "user" | "consumer" | "applicant" | "system";

/**
 * Anything whose key matches one of these is replaced with "[redacted]",
 * however deeply it is nested.
 *
 * Matched case-insensitively as a SUBSTRING, so `newPassword`, `passwordHash`,
 * `apiKey` and `two_factor_code` are all caught without being listed. Erring
 * towards over-redaction on purpose: a redacted field that turns out to be
 * harmless costs nothing, the reverse is a credential in a table Power BI
 * reads.
 */
const REDACT_KEYS = [
  "password",
  "passwordhash",
  "secret",
  "token",
  "apikey",
  "api_key",
  "key",
  "otp",
  "code",
  "ciphertext",
  "authtag",
  "iv",
  "credential",
  "auth",
  // A set-password link is a credential wearing a URL's clothes: nothing in
  // the list above matches a field called setPasswordUrl, so it is named here
  // as well as being kept out of every logged detail by hand.
  "setpasswordurl",
];

const REDACTED = "[redacted]";

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  // "code" would otherwise redact the licence-disc code, the reference code and
  // the claim number's neighbours, so the exceptions are named rather than the
  // rule being loosened.
  if (k === "postalcode" || k === "mmcode" || k === "sitecode") return false;
  return REDACT_KEYS.some((r) => k.includes(r));
}

/** Depth-limited so a cyclic or enormous object can't hang the request. */
function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return "[too deep]";

  if (Array.isArray(value)) {
    // A long array in the log is noise, not evidence. Keep the shape and the
    // count so "12 lines" is still visible.
    if (value.length > 50)
      return [...value.slice(0, 50).map((v) => redactValue(v, depth + 1)), `…${value.length - 50} more`];
    return value.map((v) => redactValue(v, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }

  // A single very long string (an OCR blob, a pasted document) would bloat
  // every row it appears in.
  if (typeof value === "string" && value.length > 2000)
    return `${value.slice(0, 2000)}… (${value.length} chars)`;

  return value;
}

export function redact<T>(value: T): unknown {
  return redactValue(value, 0);
}

/**
 * What changed, as `{ field: { from, to } }`.
 *
 * Only fields present in `after` are compared, so a patch that touches two
 * fields produces a two-field diff rather than a dump of the whole record.
 * Values go through redact(), so diffing a user record never writes the hash.
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(after)) {
    const from = before?.[k];
    // JSON compare so dates and nested objects don't report false changes.
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    out[k] = isSensitiveKey(k)
      ? { from: REDACTED, to: REDACTED }
      : { from: redact(from), to: redact(to) };
  }
  return out;
}

export interface ActivityActor {
  actorKind?: ActorKind;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  panelBeaterId?: string | null;
}

/** The actor fields for a signed-in portal user. */
export function actorFromUser(user: AuthUser): ActivityActor {
  return {
    actorKind: "user",
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    // The role NAME, not the id — the log is read by a person, and roles have
    // been renamed once already (admin → "Site Admin").
    actorRole: user.roleName ?? user.role,
    panelBeaterId: user.panelBeaterId ?? null,
  };
}

/** The actor fields for a member of the public, who has no login. */
export function consumerActor(name?: string | null, email?: string | null): ActivityActor {
  return { actorKind: "consumer", actorName: name ?? null, actorEmail: email ?? null };
}

/** The actor fields for a cron run. */
export function systemActor(job: string): ActivityActor {
  return { actorKind: "system", actorName: `Cron · ${job}` };
}

export interface ActivityInput extends ActivityActor {
  /** Dotted verb — area first, e.g. "user.create", "auth.login.failed". */
  action: string;
  /** One line a person can read without expanding anything. */
  summary: string;

  entityType?: string | null;
  entityId?: string | null;
  /** A verbatim copy, so the line still reads after the thing is deleted. */
  entityLabel?: string | null;

  outcome?: ActivityOutcome;
  status?: number | null;

  /** Changed fields, counts, totals — anything that isn't a column. */
  detail?: unknown;

  /** The incoming request, for method / path / IP / user agent. */
  request?: Request | null;
}

/** Longest we'll keep a user-agent string; they are long and low-value. */
const MAX_UA = 400;

function requestMeta(request: Request | null | undefined) {
  if (!request) return {};
  let path: string | undefined;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = undefined;
  }
  return {
    method: request.method,
    path,
    // Same derivation as lib/rateLimit.ts — Vercel sets x-forwarded-for and the
    // first entry is the client.
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      null,
    userAgent: request.headers.get("user-agent")?.slice(0, MAX_UA) ?? null,
  };
}

/**
 * Record one thing that happened.
 *
 * Awaited rather than fired and forgotten: on serverless a promise left running
 * after the response is sent is not guaranteed to finish, so a detached write
 * would drop lines unpredictably — which is worse than a few milliseconds.
 *
 * NEVER THROWS. Callers may `await logActivity(...)` anywhere without a guard.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const meta = requestMeta(input.request);
    await getDb().activityLog.create({
      data: {
        action: input.action,
        summary: input.summary.slice(0, 500),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel?.slice(0, 200) ?? null,
        outcome: input.outcome ?? "success",
        actorKind: input.actorKind ?? "user",
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        panelBeaterId: input.panelBeaterId ?? null,
        method: meta.method ?? null,
        path: meta.path ?? null,
        status: input.status ?? null,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        detail:
          input.detail === undefined || input.detail === null
            ? undefined
            : (redact(input.detail) as object),
      },
    });
  } catch (err) {
    // Deliberately swallowed — see rule 1 at the top of this file.
    console.error("[activity] failed to record", input.action, err);
  }
}

// The area display names live in lib/activityAreas.ts, which imports nothing —
// a client component needs them and cannot pull this file's Prisma dependency
// through the bundler. Re-exported so server code has one obvious place to
// import from.
export { ACTIVITY_AREAS, areaOf, areaLabel } from "./activityAreas";
