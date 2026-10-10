// ---------------------------------------------------------------------------
// Pricing a quote line off a rate card. Pure: the builder runs it for the live
// totals, and POST /api/quotes runs it again on what was posted, so the stored
// quote is priced by the SERVER from the card, never by a number the browser
// typed.
//
// The rule, wherever the card holds the rate:
//   panel and strip amount = hours x labour_rate
//   paint amount           = hours x paint_rate
//   a New / Alt / Used part with a cost = cost x (1 + that type's mark-up %)
// Anything the card has no rate for stays as typed: a workshop without a
// paint rate still has to be able to quote paint. "Type amounts manually"
// (no card chosen) prices nothing.
// ---------------------------------------------------------------------------

export type CardRates = Record<string, number>;

/**
 * Which mark-up on the rate card applies to a line, by its part-type code.
 * Anything else (Repair, Out Work, Paint, Note) isn't a part, so nothing is
 * marked up.
 */
export const MARKUP_FIELD_BY_CODE: Record<string, string> = {
  New: "markup_oem",
  Alt: "markup_alternate",
  Used: "markup_used",
};

export interface PriceableLine {
  code?: string;
  partsCost?: number;
  partsAmount: number;
  panelAmount: number;
  panelHours: number;
  paintAmount: number;
  paintHours: number;
  stripAmount: number;
  stripHours: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const rate = (rates: CardRates, key: string): number | undefined => {
  const v = rates[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

/** The mark-up % the card sets for this line's part type, if any. */
export function markupFor(rates: CardRates | undefined, code?: string): number | undefined {
  const field = MARKUP_FIELD_BY_CODE[(code ?? "").trim()];
  return rates && field ? rate(rates, field) : undefined;
}

/** True where the card decides the parts charge, so the box is not the estimator's. */
export function partsPricedByCard(rates: CardRates | undefined, line: PriceableLine): boolean {
  return line.partsCost != null && markupFor(rates, line.code) != null;
}

/** Re-price one line from the card. With no card, the line comes back as given. */
export function priceLine<T extends PriceableLine>(line: T, rates: CardRates | undefined): T {
  if (!rates) return line;
  const labour = rate(rates, "labour_rate");
  const paint = rate(rates, "paint_rate");
  const markup = markupFor(rates, line.code);
  return {
    ...line,
    partsAmount:
      line.partsCost != null && markup != null
        ? round2(line.partsCost * (1 + markup / 100))
        : line.partsAmount,
    panelAmount: labour != null ? round2(line.panelHours * labour) : line.panelAmount,
    stripAmount: labour != null ? round2(line.stripHours * labour) : line.stripAmount,
    paintAmount: paint != null ? round2(line.paintHours * paint) : line.paintAmount,
  };
}

export function priceLines<T extends PriceableLine>(lines: T[], rates: CardRates | undefined): T[] {
  return lines.map((l) => priceLine(l, rates));
}
