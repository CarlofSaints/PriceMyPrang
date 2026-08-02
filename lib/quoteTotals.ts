// ---------------------------------------------------------------------------
// One place where a quote adds up.
//
// The live totals in the builder and the stored totals written by /api/quotes
// used to be two separate reductions over the same lines. They agreed only for
// as long as nobody edited one of them, and a quote whose on-screen total
// differs from its PDF is worse than one that is merely wrong.
// ---------------------------------------------------------------------------

/** Whether sundries were entered as a rand amount or as a % of parts. */
export type SundriesMode = "rand" | "percent";

export interface TotallableLine {
  code?: string;
  partsAmount: number;
  panelAmount: number;
  paintAmount: number;
  stripAmount: number;
  panelHours: number;
  paintHours: number;
  stripHours: number;
}

/**
 * Out-work lines carry their money in `partsAmount` (the form has one money
 * box per line), but they are NOT parts — they are work sent to a third party,
 * and a repairer needs to see that separately from what they bought.
 */
export function isOutWork(code?: string): boolean {
  return (code ?? "").trim().toLowerCase() === "out work";
}

export interface QuoteTotals {
  partsTotal: number;
  outWorkTotal: number;
  panelTotal: number;
  paintTotal: number;
  stripTotal: number;
  labourTotal: number;
  totalHours: number;
  sundries: number;
  consumables: number;
  subtotal: number;
  vat: number;
  total: number;
}

export const VAT_RATE = 0.15;

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function computeQuoteTotals(input: {
  lines: TotallableLine[];
  /** Rand amount when mode is "rand"; a percentage of parts when "percent". */
  sundriesValue: number;
  sundriesMode: SundriesMode;
  consumables: number;
}): QuoteTotals {
  const { lines } = input;

  const partsTotal = lines
    .filter((l) => !isOutWork(l.code))
    .reduce((s, l) => s + n(l.partsAmount), 0);

  const outWorkTotal = lines
    .filter((l) => isOutWork(l.code))
    .reduce((s, l) => s + n(l.partsAmount), 0);

  const panelTotal = lines.reduce((s, l) => s + n(l.panelAmount), 0);
  const paintTotal = lines.reduce((s, l) => s + n(l.paintAmount), 0);
  const stripTotal = lines.reduce((s, l) => s + n(l.stripAmount), 0);
  const labourTotal = panelTotal + paintTotal + stripTotal;
  const totalHours = lines.reduce(
    (s, l) => s + n(l.panelHours) + n(l.paintHours) + n(l.stripHours),
    0
  );

  // A percentage is taken on PARTS only (Carl's ruling) — not on out work,
  // which the repairer is passing through rather than supplying.
  const sundries =
    input.sundriesMode === "percent"
      ? round2((partsTotal * n(input.sundriesValue)) / 100)
      : n(input.sundriesValue);

  const consumables = n(input.consumables);

  const subtotal = partsTotal + outWorkTotal + labourTotal + sundries + consumables;
  const vat = round2(subtotal * VAT_RATE);

  return {
    partsTotal: round2(partsTotal),
    outWorkTotal: round2(outWorkTotal),
    panelTotal: round2(panelTotal),
    paintTotal: round2(paintTotal),
    stripTotal: round2(stripTotal),
    labourTotal: round2(labourTotal),
    totalHours: round2(totalHours),
    sundries: round2(sundries),
    consumables: round2(consumables),
    subtotal: round2(subtotal),
    vat,
    total: round2(subtotal + vat),
  };
}
