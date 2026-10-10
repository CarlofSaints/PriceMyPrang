// Quote pricing off a rate card (lib/quotePricing) and the no-negatives rule
// on quote and additionals bodies. Pure: no database.
//   npm run test:pricing
import { priceLine, partsPricedByCard, type PriceableLine } from "../lib/quotePricing";
import { computeQuoteTotals } from "../lib/quoteTotals";
import { BuildQuoteBody } from "../lib/schemas/quotes";
import { SaveAdditionalBody } from "../lib/schemas/additionals";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`);
}

const card = { labour_rate: 450, paint_rate: 500, markup_oem: 25, markup_used: 10 };
const line = (p: Partial<PriceableLine>): PriceableLine => ({
  partsAmount: 0, panelAmount: 0, panelHours: 0, paintAmount: 0, paintHours: 0, stripAmount: 0, stripHours: 0,
  ...p,
});

console.log("\nPricing from the card");
let l = priceLine(line({ panelHours: 2, panelAmount: 99999 }), card);
check("panel = hours x labour rate, typed amount ignored", l.panelAmount === 900, l.panelAmount);
l = priceLine(line({ stripHours: 1.5, stripAmount: 1 }), card);
check("strip = hours x labour rate", l.stripAmount === 675, l.stripAmount);
l = priceLine(line({ paintHours: 3, paintAmount: 0 }), card);
check("paint = hours x paint rate", l.paintAmount === 1500, l.paintAmount);
l = priceLine(line({ code: "New", partsCost: 1000, partsAmount: 5000 }), card);
check("New part = cost + OEM mark-up, typed charge ignored", l.partsAmount === 1250, l.partsAmount);
l = priceLine(line({ code: "Used", partsCost: 200, partsAmount: 0 }), card);
check("Used part = cost + used mark-up", l.partsAmount === 220, l.partsAmount);
l = priceLine(line({ code: "Alt", partsCost: 300, partsAmount: 333 }), card);
check("Alt part with no alt mark-up on the card stays as typed", l.partsAmount === 333, l.partsAmount);
l = priceLine(line({ code: "New", partsAmount: 700 }), card);
check("New part with no cost stays as typed", l.partsAmount === 700, l.partsAmount);
l = priceLine(line({ code: "Repair", partsCost: 100, partsAmount: 150 }), card);
check("a Repair line is never marked up", l.partsAmount === 150, l.partsAmount);
l = priceLine(line({ paintHours: 2, paintAmount: 800 }), { labour_rate: 450 });
check("card with no paint rate leaves paint as typed", l.paintAmount === 800, l.paintAmount);
l = priceLine(line({ panelHours: 2, panelAmount: 123, code: "New", partsCost: 10, partsAmount: 99 }), undefined);
check("no card: nothing re-priced", l.panelAmount === 123 && l.partsAmount === 99, l);
check("partsPricedByCard: New + cost + mark-up", partsPricedByCard(card, line({ code: "New", partsCost: 5 })));
check("partsPricedByCard: no card", !partsPricedByCard(undefined, line({ code: "New", partsCost: 5 })));
l = priceLine(line({ panelHours: 2.22, panelAmount: 1000 }), card);
check("back-solved hours: card charges hours x rate (999), not the typed 1000", l.panelAmount === 999, l.panelAmount);

const t = computeQuoteTotals({
  lines: [priceLine(line({ code: "New", partsCost: 1000, partsAmount: 1, panelHours: 2, panelAmount: 1 }), card)],
  sundriesMode: "rand",
  sundriesValue: 0,
  consumables: 0,
});
check("totals follow the card: 1250 + 900 = 2150 ex VAT", t.subtotal === 2150, t.subtotal);

console.log("\nNo negatives");
const q = (lines: unknown[], extra: Record<string, unknown> = {}) =>
  BuildQuoteBody.safeParse({ reference: "R", panelBeaterId: "P", lines, ...extra }).success;
const ok = { description: "Bumper", partsAmount: 100, panelHours: 1 };
check("quote: ordinary line accepted", q([ok]));
for (const k of ["partsAmount", "partsCost", "panelAmount", "panelHours", "paintAmount", "paintHours", "stripAmount", "stripHours", "quantity"]) {
  check(`quote: negative ${k} refused`, !q([{ ...ok, [k]: -1 }]));
  check(`quote: negative ${k} as text refused`, !q([{ ...ok, [k]: "-1" }]));
}
check("quote: negative sundries refused", !q([ok], { sundries: -50 }));
check("quote: negative consumables refused", !q([ok], { consumables: "-5" }));
check("quote: zero and blank still accepted", q([{ ...ok, partsAmount: 0, panelHours: "" }]));
check("quote: rateCardId + scope accepted", q([ok], { rateCardId: "c1", scope: "in_warranty" }));
check("quote: unknown scope refused", !q([ok], { scope: "general" }));

const aLine = {
  description: "x", quantity: 1, partsAmount: 0, panelAmount: 0, panelHours: 0,
  paintAmount: 0, paintHours: 0, stripAmount: 0, stripHours: 0,
};
const a = (p: Record<string, unknown>) => SaveAdditionalBody.safeParse({ lines: [{ ...aLine, ...p }] }).success;
check("additionals: ordinary line accepted", a({}));
for (const k of ["partsAmount", "partsCost", "panelAmount", "panelHours", "paintAmount", "paintHours", "stripAmount", "stripHours", "quantity"]) {
  check(`additionals: negative ${k} refused`, !a({ [k]: -0.01 }));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
