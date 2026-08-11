import { NextResponse } from "next/server";
import { listDueDevReminders, markDevReminderSent } from "@/lib/store";
import { sendDevTicketReminder } from "@/lib/email";
import { logActivity, systemActor } from "@/lib/activityLog";

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
  // The secret was missing from this comparison — it read `Bearer ` with no
  // interpolation, so the real cron call (which sends `Bearer <secret>`) was
  // rejected 401 and this reminder has never run, while anyone sending the
  // literal header `Authorization: Bearer ` would have been let straight in.
  // The warranty cron next door has always had it right.
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
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

  // A cron that stops running is invisible until somebody notices the emails
  // stopped — which is exactly what the bug above caused. A row per run means
  // "when did this last work" is a question the log can answer.
  await logActivity({
    action: "cron.dev_reminders",
    summary: `Dev reminders ran: ${due.length} due, ${sent} sent`,
    outcome: sent === due.length ? "success" : "failed",
    ...systemActor("dev-reminders"),
    detail: { due: due.length, sent, log },
    request,
  });

  return NextResponse.json({ ok: true, due: due.length, sent, log });
}
