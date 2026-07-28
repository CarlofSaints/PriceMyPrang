import { NextResponse } from "next/server";
import { acceptQuote } from "@/lib/store";

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

  const result = await acceptQuote(token.trim(), quoteId.trim());

  if (!result.ok) {
    // Don't distinguish "no such token" from "that quote is on another job" —
    // either way the caller has no business with it.
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
