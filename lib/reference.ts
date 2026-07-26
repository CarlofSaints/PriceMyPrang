import { getDb } from "./db";

/**
 * Generate a sequential reference of the form:
 *   PMP-YYYYMMDD-SURNAME-NN
 * where NN is a per-day running counter.
 *
 * The counter is incremented by the database itself (a single atomic upsert),
 * so two submissions in flight at the same moment can't be handed the same
 * number. createRequest() additionally relies on the unique constraint on
 * `reference` as a backstop.
 */
export async function nextReference(lastName: string): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateKey = `${y}${m}${d}`;

  const counter = await getDb().referenceCounter.upsert({
    where: { dateKey },
    create: { dateKey, seq: 1 },
    update: { seq: { increment: 1 } },
    select: { seq: true },
  });

  const surname =
    (lastName || "CLIENT")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 12) || "CLIENT";

  return `PMP-${dateKey}-${surname}-${String(counter.seq).padStart(2, "0")}`;
}
