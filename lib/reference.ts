import { readJson, writeJson, PATHS } from "./blob";

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

  const counters = (await readJson<Counters>(PATHS.counters)) ?? {};
  const seq = (counters[dateKey] ?? 0) + 1;
  counters[dateKey] = seq;
  await writeJson(PATHS.counters, counters);

  const surname = (lastName || "CLIENT")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 12) || "CLIENT";

  return `PMP-${dateKey}-${surname}-${String(seq).padStart(2, "0")}`;
}
