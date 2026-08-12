import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { actorFromUser, logActivity } from "@/lib/activityLog";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// "Somebody's upload was refused" — the one thing this app could not see.
//
// Client uploads go straight from the browser to Vercel Blob. We mint the token
// and hear nothing more, so when Blob rejects a file the server has no idea it
// happened: on 12 Aug 2026 a repairer spent an afternoon re-picking a PDF the
// allow-list refused, and there was no record of them, their file, or the
// attempt. This endpoint is how the browser tells us.
//
// THREE THINGS TO KNOW:
//
//  1. IT ALWAYS RETURNS 200. It is an error reporter; a person already looking
//     at one failure must never be shown a second one because the reporting of
//     the first failed. Bad JSON, missing fields and rate limiting all answer
//     {ok:true}.
//
//  2. THE CONTENTS ARE CLAIMED BY THE BROWSER, NOT VERIFIED. Anyone can POST
//     here — an applicant has no login, so it cannot be gated. The row is
//     therefore marked `reportedBy: "browser"`, and identity is taken from the
//     SESSION when there is one, falling back to the typed-in details only for
//     someone who genuinely has no account yet. Read these rows as evidence of
//     a person's experience, never as proof of who they were.
//
//  3. NO FILE BYTES. Name, type and size — enough to answer "which file, what
//     format, how big", nothing worth storing.
// ---------------------------------------------------------------------------

/** Free text from an anonymous caller; keep it short. */
const MAX_TEXT = 200;
const MAX_REASON = 300;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * A Blob SDK message can carry a URL with a credential in the query string.
 * Rule 2 of the activity log is never to log one, and the key-name redactor
 * cannot see inside a free-text sentence — so strip them by shape here.
 */
function stripSecrets(s: string): string {
  return s
    .replace(/vercel_blob_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/https?:\/\/\S+/g, "[url]");
}

export async function POST(request: Request): Promise<NextResponse> {
  // Public endpoint: cap it so the log can't be flooded into uselessness.
  const limit = rateLimit(`upload-failed:${clientIp(request)}`, 20, 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter, "Too many reports.") as NextResponse;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const fileName = text(body.fileName) ?? "(unnamed file)";
  const contentType = text(body.contentType, 100) ?? "unknown type";
  const context = text(body.context) ?? "an upload";
  const label = text(body.label);
  const rawReason = text(body.reason, MAX_REASON);
  const reason = rawReason ? stripSecrets(rawReason) : null;
  const sizeBytes =
    typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
      ? Math.max(0, Math.round(body.sizeBytes))
      : null;

  // A signed-in repairer is known for certain; an applicant is not, so their
  // own typed details are the best available and are marked as claimed.
  const user = await getCurrentUser();
  const claimedName = text(body.name);
  const claimedEmail = text(body.email);
  const claimedCompany = text(body.company);

  const who = user?.name ?? claimedName ?? claimedCompany ?? "Someone with no login";

  await logActivity({
    action: "media.upload_failed",
    summary:
      `${who} could not upload ${fileName} (${contentType}) on ${context}` +
      (label ? ` — ${label}` : ""),
    entityType: "media",
    entityLabel: fileName,
    outcome: "failed",
    ...(user
      ? actorFromUser(user)
      : {
          actorKind: "applicant" as const,
          actorName: claimedName,
          actorEmail: claimedEmail,
        }),
    detail: {
      fileName,
      contentType,
      sizeBytes,
      context,
      label,
      reason,
      company: claimedCompany,
      // So a reader knows how much to trust the fields above.
      reportedBy: "browser",
      identity: user ? "session" : "typed into the form",
    },
    request,
  });

  return NextResponse.json({ ok: true });
}
