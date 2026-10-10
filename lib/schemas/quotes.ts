import { z } from "zod";

// Request body for POST /api/quotes (components/QuoteBuilder.tsx). See
// lib/validate.ts for why every object here is strict.
//
// Numbers are accepted as numbers OR strings because the route runs every one
// through its own num(): the builder sends numbers today, but nothing about the
// route required it, and a quote that won't save mid-job costs a repairer.
// No figure on a quote is ever below zero: a negative charge, hour or cost
// would quietly knock money off the total the client is shown. A string that
// isn't a number still passes and becomes 0 in the route, as it always has.
const amount = z
  .union([z.number(), z.string().max(50)])
  .nullable()
  .optional()
  .refine((v) => v == null || v === "" || !(Number(v) < 0), "Must not be negative");
const code = z.string().max(200).nullable().optional();

/**
 * One line, exactly the keys of lib/types QuoteLineItem: the builder posts its
 * lines as it holds them, including ones reloaded from a saved quote.
 *
 * Never set: any line id, quoteId, sortOrder (all minted when stored).
 * supplierId is accepted but checked against the quoting workshop's own book.
 */
const QuoteLine = z.strictObject({
  code,
  description: z.string().max(20000).nullable().optional(),
  quantity: amount,
  partsCost: amount,
  partsAmount: amount,
  partId: code,
  partNumber: code,
  supplierId: code,
  supplier: code,
  panelCode: code,
  panelAmount: amount,
  panelHours: amount,
  paintCode: code,
  paintAmount: amount,
  paintHours: amount,
  stripCode: code,
  stripAmount: amount,
  stripHours: amount,
});

/**
 * POST /api/quotes: build (or rebuild) one workshop's quote on a job.
 *
 * Never set: id, status, acceptedAt, pdfUrl, createdAt, createdByName,
 * estimatorName, sundriesPercent, and every computed figure (partsTotal,
 * outWorkTotal, panelTotal, paintTotal, stripTotal, labourTotal, totalHours,
 * subtotal, vat, total). The server prices the lines itself, and where a
 * rate card is named it also re-prices each line's labour, paint and marked-up
 * parts from that card: the amounts posted for those are not believed.
 */
export const BuildQuoteBody = z.strictObject({
  reference: z.string().max(200),
  panelBeaterId: z.string().max(200),
  lines: z.array(QuoteLine).max(500).optional(),
  /** A rand amount, or a percentage of parts when sundriesMode is "percent". */
  sundries: amount,
  sundriesMode: z.enum(["rand", "percent"]).optional(),
  consumables: amount,
  notes: z.string().max(20000).nullable().optional(),
  /**
   * The workshop's rate card the quote is priced on, and which block of it.
   * The server loads the card itself, checks it is THIS workshop's, and
   * re-prices every line from it (lib/quotePricing). Absent or "" = no card,
   * amounts typed by hand.
   */
  rateCardId: z.string().max(200).nullable().optional(),
  scope: z.enum(["in_warranty", "out_of_warranty", "aluminium"]).optional(),
});
