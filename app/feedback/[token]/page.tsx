import Link from "next/link";
import {
  resolveConsumerAccessLink,
  markConsumerLinkUsed,
  requestReferenceById,
  getRequest,
  acceptedPanelBeaterFor,
  quotedPanelBeatersFor,
  getRatingFor,
} from "@/lib/store";
import { Logo } from "@/components/Logo";
import FeedbackFlow, { type FeedbackContext } from "@/components/FeedbackFlow";

// The token is the credential. Resolved on the server so nothing about the job
// reaches the browser unless the link is genuine and unexpired.
export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveConsumerAccessLink(token);

  const shell = (children: React.ReactNode) => (
    <main className="min-h-dvh bg-offwhite p-5">
      <div className="mx-auto w-full max-w-lg py-6">
        <div className="mb-6 text-center">
          <Logo variant="primary-light" className="mx-auto h-24 w-auto" priority />
        </div>
        {children}
        <p className="mt-6 text-center text-sm text-ink/50">
          <Link href="/" className="text-teal hover:underline">
            ← Back to Price my Prang
          </Link>
        </p>
      </div>
    </main>
  );

  if (!link)
    return shell(
      <div className="pmp-card space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold text-ink">That link has expired</h1>
        <p className="text-sm text-ink/70">
          Feedback links last 48 hours. Ask for a fresh one and we&apos;ll email it straight
          away.
        </p>
        <Link
          href="/feedback"
          className="inline-block rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white"
        >
          Send me a new link
        </Link>
      </div>
    );

  await markConsumerLinkUsed(token);

  const reference = await requestReferenceById(link.requestId);
  const request = reference ? await getRequest(reference) : null;
  if (!request || !reference)
    return shell(
      <div className="pmp-card p-6 text-center">
        <p className="text-sm text-ink/70">We couldn&apos;t find that job.</p>
      </div>
    );

  // Only the workshop whose quote they accepted — the one that actually did the
  // work. Falls back to everyone quoted if none was accepted, so a poor quoting
  // experience can still be raised.
  const accepted = await acceptedPanelBeaterFor(link.requestId);
  const workshops = accepted ? [accepted] : await quotedPanelBeatersFor(link.requestId);

  const existing = workshops.length
    ? await getRatingFor(link.requestId, workshops[0].id)
    : null;

  const ctx: FeedbackContext = {
    reference,
    firstName: request.firstName,
    vehicle: [request.vehicle.make, request.vehicle.model, request.vehicle.year]
      .filter(Boolean)
      .join(" "),
    registration: request.vehicle.registration ?? null,
    workshops,
    existingRating: existing ? { score: existing.score, comment: existing.comment } : null,
  };

  return shell(
    <>
      <h1 className="mb-4 text-center font-display text-2xl font-bold text-ink">
        Hi {request.firstName}
      </h1>
      {workshops.length === 0 ? (
        <div className="pmp-card p-6 text-center">
          <p className="text-sm text-ink/70">
            There&apos;s no repairer on this job yet, so there&apos;s nothing to rate.
          </p>
        </div>
      ) : (
        <FeedbackFlow token={token} ctx={ctx} />
      )}
    </>
  );
}
