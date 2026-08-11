import { NextResponse } from "next/server";
import { acceptQuote, getRequestByPublicToken } from "@/lib/store";
import { logActivity, consumerActor } from "@/lib/activityLog";

// PUBLIC (no auth): the consumer accepts one of the quotes on their own job.
// The request's publicToken is the credential — it arrives in their email and
// is unguessable, unlike the reference. There is no login on the consumer side.
export async function POST(request: Request) {
  const { token, quoteId } = (await request.json()) as {
    token?: string;
    quoteId?: string;
  };

  if (!token?.trim() || !quoteId?.trim())
    return NextResponse.json({ error: "Missing token or quote" }, { status: 400 });

  // Read the job BEFORE accepting, so a failure still has something to name and
  // the log line isn't just an opaque token.
  const req = await getRequestByPublicToken(token.trim());

  const result = await acceptQuote(token.trim(), quoteId.trim());

  if (!result.ok) {
    await logActivity({
      action: "quote.accept",
      summary: req
        ? `A quote could not be accepted on ${req.reference}`
        : "A quote acceptance was attempted with an unrecognised link",
      outcome: "failed",
      status: 404,
      entityType: "request",
      entityId: req?.reference,
      entityLabel: req?.reference,
      // The token is the credential and is never written to the log.
      ...consumerActor(req ? `${req.firstName} ${req.lastName}` : undefined, req?.email),
      detail: { quoteId: quoteId.trim() },
      request,
    });
    // Don't distinguish "no such token" from "that quote is on another job" —
    // either way the caller has no business with it.
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // The moment a job is won. Accepting one quote declines every sibling, so
  // this single line explains why several workshops' quotes changed at once.
  const accepted = req?.quotes?.find((q) => q.id === quoteId.trim());
  await logActivity({
    action: "quote.accept",
    summary: req
      ? `${req.firstName} ${req.lastName} accepted a quote on ${req.reference}`
      : "A consumer accepted a quote",
    entityType: "request",
    entityId: req?.reference,
    entityLabel: req?.reference,
    ...consumerActor(req ? `${req.firstName} ${req.lastName}` : undefined, req?.email),
    panelBeaterId: accepted?.panelBeaterId,
    detail: {
      quoteId: quoteId.trim(),
      total: accepted?.total,
      quotesOnJob: req?.quotes?.length,
    },
    request,
  });

  return NextResponse.json({ ok: true });
}
