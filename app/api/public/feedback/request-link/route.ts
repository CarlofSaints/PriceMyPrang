import { NextResponse } from "next/server";
import { clientIp, limitOrRespond } from "@/lib/rateLimit";
import { requestKeyByReference, createConsumerAccessLink, getRequest } from "@/lib/store";
import { sendConsumerFeedbackLink } from "@/lib/email";
import { logActivity, consumerActor } from "@/lib/activityLog";
import { parseJson } from "@/lib/validate";
import { FeedbackLinkBody } from "@/lib/schemas/public";

// ---------------------------------------------------------------------------
// "I want to rate or complain about my repair."
//
// The consumer types their REFERENCE, but PMP-date-SURNAME-nn is guessable:
// it names a job, it doesn't prove you own one. So the reference only triggers
// an email to the address already on that job; the link in that email is the
// actual credential.
//
// The response is IDENTICAL whether or not the reference exists. Anything else
// turns this endpoint into an oracle for which references are real.
// ---------------------------------------------------------------------------

const SAME_ANSWER = {
  ok: true,
  message:
    "If that reference is one of ours, we've emailed a link to the address on the job. Please check your inbox.",
};


export async function POST(request: Request) {
  // Per IP: also what stops someone walking the reference space.
  const limited = await limitOrRespond("feedbackLink", clientIp(request));
  if (limited) return limited;

  const parsed = await parseJson(request, FeedbackLinkBody, "POST /api/public/feedback/request-link");
  if (parsed.response) return parsed.response;
  const ref = parsed.data.reference?.trim() ?? "";
  if (!ref) return NextResponse.json({ error: "Enter your reference number" }, { status: 400 });

  let matched = false;
  try {
    const key = await requestKeyByReference(ref);
    matched = !!key;
    // No email on the job means nowhere to send the credential. Still the same
    // answer outwardly.
    if (key?.email) {
      const token = await createConsumerAccessLink(key.id, key.email);
      const req = await getRequest(key.reference);
      if (req) await sendConsumerFeedbackLink(req, token);
    }
  } catch {
    // A lookup or send failure must not change the shape of the reply either.
  }

  // The RESPONSE stays identical for a real and a made-up reference; the LOG
  // may tell them apart, and has to: a run of misses from one address is
  // somebody walking the reference space, which is the attack this endpoint was
  // designed against. Only a Super Admin ever reads this.
  await logActivity({
    action: "feedback.link_request",
    summary: matched
      ? `A feedback link was requested for ${ref}`
      : `A feedback link was requested for ${ref}, which matched no job`,
    outcome: matched ? "success" : "failed",
    entityType: "request",
    entityId: matched ? ref : undefined,
    entityLabel: ref,
    ...consumerActor(),
    detail: { reference: ref, matched },
    request,
  });

  return NextResponse.json(SAME_ANSWER);
}
