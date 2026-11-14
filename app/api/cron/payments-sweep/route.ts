import { NextResponse } from "next/server";
import { reconcileOpenPayments } from "@/lib/payments";

export const maxDuration = 60;

// Runs daily (see vercel.json). Asks Ozow about every payment still open from
// the last 3 days. Catches a webhook that never arrived, and closes abandoned
// links so the voucher use each one was holding is given back.
export async function GET(request: Request) {
  // Fails closed, like the other crons: no secret configured = refuse.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set, refusing to run the cron.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const checked = await reconcileOpenPayments();
  return NextResponse.json({ checked });
}
