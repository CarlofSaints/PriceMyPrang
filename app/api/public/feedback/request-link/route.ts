import { NextResponse } from "next/server";
import { requestKeyByReference, createConsumerAccessLink, getRequest } from "@/lib/store";
import { sendConsumerFeedbackLink } from "@/lib/email";

// ---------------------------------------------------------------------------
// "I want to rate or complain about my repair."
//
// The consumer types their REFERENCE, but PMP-date-SURNAME-nn is guessable —
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

/** Per-IP, in-memory. Enough to stop someone walking the reference space. */
const hits = new Map<string, { n: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now > cur.resetAt) {
    hits.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > LIMIT;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip))
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 }
    );

  const { reference } = (await request.json()) as { reference?: string };
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (!ref) return NextResponse.json({ error: "Enter your reference number" }, { status: 400 });

  try {
    const key = await requestKeyByReference(ref);
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

  return NextResponse.json(SAME_ANSWER);
}
