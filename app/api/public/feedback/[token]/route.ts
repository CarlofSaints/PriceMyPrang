import { NextResponse } from "next/server";
import {
  resolveConsumerAccessLink,
  markConsumerLinkUsed,
  requestReferenceById,
  getRequest,
  acceptedPanelBeaterFor,
  quotedPanelBeatersFor,
  upsertRating,
  getRatingFor,
  createComplaint,
  getPanelBeater,
} from "@/lib/store";
import { sendComplaintLodged, sendComplaintConfirmation } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_OUTCOMES,
  COMPLAINT_MAX_WORDS,
  type ComplaintCategory,
  type ComplaintOutcome,
  type VehicleSafety,
} from "@/lib/types";

// The consumer side of QC. The token in the URL is the credential — it was
// emailed to the address already on the job, because the reference itself is
// PMP-date-SURNAME-nn and therefore guessable.

/** Resolve the token to the job and the workshop they may rate or complain about. */
async function context(token: string) {
  const link = await resolveConsumerAccessLink(token);
  if (!link) return null;

  const reference = await requestReferenceById(link.requestId);
  if (!reference) return null;
  const request = await getRequest(reference);
  if (!request) return null;

  // Only the workshop whose quote they ACCEPTED — the one that actually
  // touched the car. If nothing was accepted we fall back to the workshops the
  // job was sent to, so a bad quoting experience can still be raised.
  const accepted = await acceptedPanelBeaterFor(link.requestId);
  const workshops = accepted ? [accepted] : await quotedPanelBeatersFor(link.requestId);

  return { requestId: link.requestId, reference, request, workshops, accepted };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ctx = await context(token);
  if (!ctx) return NextResponse.json({ error: "Link expired" }, { status: 404 });

  await markConsumerLinkUsed(token);

  const existing = ctx.workshops.length
    ? await getRatingFor(ctx.requestId, ctx.workshops[0].id)
    : null;

  return NextResponse.json({
    reference: ctx.reference,
    firstName: ctx.request.firstName,
    vehicle: [ctx.request.vehicle.make, ctx.request.vehicle.model, ctx.request.vehicle.year]
      .filter(Boolean)
      .join(" "),
    registration: ctx.request.vehicle.registration ?? null,
    workshops: ctx.workshops,
    // So the page can say "you rated them 4" rather than starting blank.
    existingRating: existing ? { score: existing.score, comment: existing.comment } : null,
  });
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = clientIp(request);
  const limited = rateLimit(`feedback:${ip}`, 20, 15 * 60_000);
  if (!limited.ok)
    return tooManyRequests(limited.retryAfter, "Too many submissions. Please wait a few minutes.");

  const { token } = await params;
  const ctx = await context(token);
  if (!ctx) return NextResponse.json({ error: "Link expired" }, { status: 404 });

  const b = (await request.json()) as Record<string, unknown>;
  const kind = b.kind === "complaint" ? "complaint" : "rating";

  // The workshop must be one this job actually went to — never trusted from
  // the body alone, or a link for one job could be used to rate any workshop.
  const panelBeaterId = typeof b.panelBeaterId === "string" ? b.panelBeaterId : "";
  const workshop = ctx.workshops.find((w) => w.id === panelBeaterId);
  if (!workshop)
    return NextResponse.json({ error: "Choose the workshop that did the work" }, { status: 400 });

  if (kind === "rating") {
    const score = Number(b.score);
    if (!Number.isInteger(score) || score < 1 || score > 5)
      return NextResponse.json({ error: "Give a rating from 1 to 5" }, { status: 400 });

    const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 2000) : "";
    await upsertRating({
      requestId: ctx.requestId,
      panelBeaterId: workshop.id,
      score,
      comment: comment || undefined,
    });
    return NextResponse.json({ ok: true, kind: "rating" });
  }

  // ---- Complaint ----
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description)
    return NextResponse.json({ error: "Tell us what went wrong" }, { status: 400 });
  if (wordCount(description) > COMPLAINT_MAX_WORDS)
    return NextResponse.json(
      { error: `Please keep it under ${COMPLAINT_MAX_WORDS} words.` },
      { status: 400 }
    );

  const one = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(v as T) ? (v as T) : undefined;

  const media = (Array.isArray(b.media) ? b.media : [])
    .filter((m): m is { url: string; pathname: string; contentType?: string; isVideo?: boolean } =>
      !!m && typeof m === "object" && !!(m as { url?: string }).url
    )
    // Five photos and one clip, enforced here as well as in the form.
    .slice(0, 6)
    .map((m) => ({
      url: m.url,
      pathname: m.pathname,
      contentType: m.contentType,
      isVideo: !!m.isVideo,
    }));

  const complaint = await createComplaint({
    requestId: ctx.requestId,
    panelBeaterId: workshop.id,
    category: one<ComplaintCategory>(b.category, COMPLAINT_CATEGORIES) ?? "other",
    description,
    vehicleSafety: one<VehicleSafety>(b.vehicleSafety, ["safe", "unsafe", "unsure"] as const),
    collectedOn: typeof b.collectedOn === "string" ? b.collectedOn : undefined,
    problemNoticedOn: typeof b.problemNoticedOn === "string" ? b.problemNoticedOn : undefined,
    stillWithRepairer: typeof b.stillWithRepairer === "boolean" ? b.stillWithRepairer : undefined,
    desiredOutcome: one<ComplaintOutcome>(b.desiredOutcome, COMPLAINT_OUTCOMES),
    raisedWithRepairer:
      typeof b.raisedWithRepairer === "boolean" ? b.raisedWithRepairer : undefined,
    // Observed, not asked for — we already know who they are from the link.
    submittedIp: ip,
    submittedUserAgent: request.headers.get("user-agent") ?? undefined,
    media,
  });

  // Emails are best-effort: a send failure must not lose a complaint that has
  // already been recorded.
  const pb = await getPanelBeater(workshop.id);
  try {
    await sendComplaintLodged(complaint, ctx.request, pb ?? null);
  } catch (err) {
    console.error("complaint notification failed", err);
  }
  try {
    await sendComplaintConfirmation(complaint, ctx.request, workshop.name);
  } catch (err) {
    console.error("complaint confirmation failed", err);
  }

  return NextResponse.json({ ok: true, kind: "complaint" });
}
