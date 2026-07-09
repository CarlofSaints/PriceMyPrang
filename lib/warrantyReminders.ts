// Reminder milestones before a warranty certificate expires.
// A window is chosen by how many whole days remain until expiry, so at most one
// reminder fires per run (prevents duplicate/backlog emails).
export interface ReminderWindow {
  key: string; // stored in remindersSent
  min: number; // inclusive days-until-expiry
  max: number;
  label: string; // human phrasing for the email
}

export const REMINDER_WINDOWS: ReminderWindow[] = [
  { key: "3m", min: 76, max: 92, label: "in about 3 months" },
  { key: "2m", min: 46, max: 62, label: "in about 2 months" },
  { key: "1m", min: 22, max: 32, label: "in about a month" },
  { key: "2w", min: 12, max: 16, label: "in about 2 weeks" },
  { key: "1d", min: 0, max: 1, label: "tomorrow" },
];

/** Whole days from `from` (default today) until the yyyy-mm-dd expiry date. */
export function daysUntil(expiryDate: string, from: Date): number {
  const expiry = new Date(`${expiryDate}T00:00:00Z`).getTime();
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((expiry - start) / 86_400_000);
}

export function windowForDays(days: number): ReminderWindow | null {
  return REMINDER_WINDOWS.find((w) => days >= w.min && days <= w.max) ?? null;
}

import type { WarrantyApproval } from "./types";

/**
 * Normalise incoming warranties and carry over reminder state. If the expiry
 * date is unchanged we keep which reminders were already sent; if it changed
 * (renewal) we clear them so the reminder schedule re-arms.
 */
export function mergeWarranties(
  incoming: WarrantyApproval[],
  existing?: WarrantyApproval[]
): WarrantyApproval[] {
  return (incoming || [])
    .filter((w) => w?.manufacturer)
    .map((w) => {
      const prev = existing?.find((e) => e.manufacturer === w.manufacturer);
      const keepSent = prev && prev.expiryDate === w.expiryDate ? prev.remindersSent ?? [] : [];
      return {
        manufacturer: w.manufacturer,
        startDate: w.startDate || undefined,
        expiryDate: w.expiryDate || undefined,
        certificate: w.certificate || prev?.certificate,
        remind: !!w.remind,
        remindersSent: keepSent,
      };
    });
}
