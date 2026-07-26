import { updateJson, PATHS } from "./blob";

interface Counters {
  [dateKey: string]: number;
}

/**
 * Generate a sequential reference of the form:
 *   PMP-YYYYMMDD-SURNAME-NN
 * where NN is a per-day running counter.
 */
export async function nextReference(lastName: string): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateKey = `${y}${m}${d}`;

  // Claim the next sequence number atomically. Without this, two submissions in
  // flight at once both read the same counter and produce the same reference —
  // and the second request would then overwrite the first.
  let seq = 0;
  await updateJson<Counters>(PATHS.counters, (current) => {
    const counters = { ...(current ?? {}) };
    seq = (counters[dateKey] ?? 0) + 1;
    counters[dateKey] = seq;
    return counters;
  });

  const surname = (lastName || "CLIENT")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 12) || "CLIENT";

  return `PMP-${dateKey}-${surname}-${String(seq).padStart(2, "0")}`;
}
