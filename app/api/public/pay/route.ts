import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { startPayment, siteUrlFor } from "@/lib/payments";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";
import { parseJson } from "@/lib/validate";
import { PayBody } from "@/lib/schemas/public";

// PUBLIC: the customer has no login. The request's publicToken is the only
// credential, the same one that opens their quotes page.
export async function POST(request: Request) {
  const rl = rateLimit(`pay:${clientIp(request)}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter, "Too many attempts. Please wait a minute and try again.");

  const parsed = await parseJson(request, PayBody, "POST /api/public/pay");
  if (parsed.response) return parsed.response;
  const { token } = parsed.data;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const row = await getDb().quoteRequest.findUnique({ where: { publicToken: token }, select: { id: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await startPayment(row.id, siteUrlFor(request));
    return NextResponse.json(result);
  } catch {
    // Ozow's reason is in the activity log. The customer gets a plain answer.
    return NextResponse.json(
      { error: "We couldn't open the payment page just now. Please try again in a few minutes." },
      { status: 502 }
    );
  }
}
