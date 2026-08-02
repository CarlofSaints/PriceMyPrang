import { NextResponse } from "next/server";
import { listDueDevReminders, markDevReminderSent } from "@/lib/store";
import { sendDevTicketReminder } from "@/lib/email";

export const maxDuration = 60;

// Runs daily (see vercel.json). Emails whoever logged a dev ticket once its
// reminder date arrives. Kept separate from the warranty cron so a failure in
// one can't stop the other running.
export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  //
  // FAILS CLOSED. This used to read `if (secret && ...)`, so an unset
  // CRON_SECRET disabled the check entirely and left the route open to anyone
  // — a guard written as a condition that is skipped when its own input is
  // missing. A missing secret is now a misconfiguration, not permission.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set — refusing to run the cron.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer `) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await listDueDevReminders(new Date());
  let sent = 0;
  const log: string[] = [];

  for (const ticket of due) {
    const res = await sendDevTicketReminder(ticket);
    if (res.sent) {
      // Only stamped on success, so a send that failed is retried tomorrow
      // rather than being silently marked as done.
      await markDevReminderSent(ticket.id);
      sent++;
      log.push(`${ticket.title} -> ${ticket.createdByEmail ?? "admins"}`);
    } else {
      log.push(`FAILED ${ticket.title}: ${res.error}`);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, sent, log });
}
