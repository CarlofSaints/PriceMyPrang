import { NextResponse } from "next/server";
import { getPanelBeaters, upsertPanelBeater } from "@/lib/store";
import { sendWarrantyExpiryReminder } from "@/lib/email";
import { daysUntil, windowForDays } from "@/lib/warrantyReminders";

export const maxDuration = 60;

// Runs daily (see vercel.json). For every warranty with "remind" on, sends the
// appropriate expiry reminder once (3m / 2m / 1m / 2w / 1 day before expiry).
export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const panelBeaters = await getPanelBeaters();
  let checked = 0;
  let sent = 0;
  const log: string[] = [];

  for (const pb of panelBeaters) {
    if (!pb.warranties?.length) continue;
    let changed = false;

    for (const w of pb.warranties) {
      if (!w.remind || !w.expiryDate) continue;
      checked++;
      const days = daysUntil(w.expiryDate, now);
      if (days < 0) continue; // already expired
      const win = windowForDays(days);
      if (!win) continue;
      w.remindersSent = w.remindersSent ?? [];
      if (w.remindersSent.includes(win.key)) continue;

      const res = await sendWarrantyExpiryReminder(pb, w, win.label);
      if (res.sent) {
        w.remindersSent.push(win.key);
        changed = true;
        sent++;
        log.push(`${pb.companyName} / ${w.manufacturer}: ${win.key}`);
      } else {
        log.push(`FAILED ${pb.companyName} / ${w.manufacturer}: ${res.error}`);
      }
    }

    if (changed) await upsertPanelBeater(pb);
  }

  return NextResponse.json({ ok: true, checked, sent, log });
}
