import { z } from "zod";
import { isUnsafeMediaPath } from "@/lib/mediaPath";

// ---------------------------------------------------------------------------
// Bodies for the media endpoints: the two OCR reads and the upload-failure
// reporter. All three are ANONYMOUS, so nothing here is trusted beyond its
// shape: the OCR routes still run isAnonReadableMedia on the pathname, and
// the reporter still trims and caps every string itself.
//
// /api/media/upload is NOT here: its body is @vercel/blob's own
// HandleUploadBody protocol, which the SDK parses and which we don't own. That
// route guards the pathname inside onBeforeGenerateToken instead.
// ---------------------------------------------------------------------------

/**
 * POST /api/disc/read and POST /api/odometer/read.
 * The UI sends `pathname`; `url` is the older proxy-URL form the route still reads.
 * NEVER-SET: nothing else. Which file is read is decided by the pathname alone,
 * and the route refuses any outside requests/.
 */
export const MediaReadBody = z.strictObject({
  pathname: z.string().max(1000).optional(),
  url: z.string().max(2000).optional(),
});

/**
 * POST /api/media/upload-failed. Every field optional: the route ALWAYS answers
 * 200 and fills in "(unnamed file)" etc. for anything missing.
 * NEVER-SET: identity when signed in (taken from the session, not these
 * fields), reportedBy, identity, actorKind. Generous caps: the route truncates
 * to 200/300 itself, and a report dropped for being long is a report lost.
 */
export const UploadFailedBody = z.strictObject({
  context: z.string().max(2000).nullish(),
  label: z.string().max(2000).nullish(),
  fileName: z.string().max(2000).nullish(),
  contentType: z.string().max(2000).nullish(),
  sizeBytes: z.number().nullish(),
  reason: z.string().max(20000).nullish(),
  name: z.string().max(2000).nullish(),
  email: z.string().max(2000).nullish(),
  company: z.string().max(2000).nullish(),
});

/**
 * Where an ANONYMOUS client upload may land. The token endpoint is open to
 * anyone, so without this a caller could mint a token for any pathname in the
 * store, `dev-tickets/` or `agreements/` included.
 *
 *  - requests/      the consumer and repairer quote forms (disc, odometer, photos)
 *  - panel-beaters/ warranty certificates and logos, from the public Join form
 *                   as well as a signed-in workshop
 *  - complaints/    photos and video on the rate-my-repair page, reached by a
 *                   token link with no login
 */
export const ANON_UPLOAD_PREFIXES = ["requests/", "panel-beaters/", "complaints/"] as const;

export function isAllowedUploadPathname(pathname: string): boolean {
  // Traversal and absolute paths first, or "requests/../dev-tickets/x" passes.
  if (isUnsafeMediaPath(pathname)) return false;
  return ANON_UPLOAD_PREFIXES.some((p) => pathname.startsWith(p));
}
