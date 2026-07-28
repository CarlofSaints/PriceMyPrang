import type { RateUnit } from "./types";

// ---------------------------------------------------------------------------
// The rate card structure, fixed in code.
//
// This replaced admin-configurable "rate types". A card is a set of rates a
// workshop quotes on: one for cash (the client pays directly) and one per
// insurer they work with. Insurer cards inherit their values from the central
// card a Super Admin sets on the Insurers page — a workshop doesn't get to
// invent an insurer's rates.
//
// Adding a rate means adding to a list here. That's deliberate: the client
// specified an exact set, and every consumer of a card (the editor, the quote
// builder, Power BI) can then rely on the shape.
// ---------------------------------------------------------------------------

/** The warranty-scoped blocks, plus the card-level one. */
export type RateScope = "in_warranty" | "out_of_warranty" | "aluminium" | "general";

export interface RateField {
  key: string;
  label: string;
  unit: RateUnit;
}

export const SCOPE_LABELS: Record<RateScope, string> = {
  in_warranty: "In warranty",
  out_of_warranty: "Out of warranty",
  aluminium: "Aluminium",
  general: "General rates",
};

/**
 * Repeated identically for in-warranty, out-of-warranty and aluminium — a
 * workshop charges differently for the same work depending on which applies.
 */
export const SCOPED_FIELDS: RateField[] = [
  { key: "labour_rate", label: "Labour rate", unit: "rand_per_hour" },
  { key: "paint_rate", label: "Paint rate", unit: "rand_per_hour" },
  { key: "markup_oem", label: "Mark-up on parts — OEM", unit: "percent" },
  { key: "markup_alternate", label: "Mark-up on parts — alternate", unit: "percent" },
  { key: "markup_used", label: "Mark-up on parts — used", unit: "percent" },
  { key: "diagnostics", label: "Diagnostics", unit: "rand" },
  { key: "rim_repair_aluminium", label: "Rim repair — aluminium (avg)", unit: "rand" },
  { key: "rim_repair_diamond_cut", label: "Rim repair — diamond cut (avg)", unit: "rand" },
  { key: "wheel_alignment", label: "Wheel alignment", unit: "rand" },
  { key: "wheel_alignment_4way", label: "Wheel alignment — 4 way", unit: "rand" },
];

/** Charged the same however the job is funded, so they sit outside the blocks. */
export const GENERAL_FIELDS: RateField[] = [
  { key: "mechanical_suspension", label: "Mechanical / suspension", unit: "rand_per_hour" },
  { key: "cut_and_weld", label: "Cut & weld", unit: "rand_per_hour" },
  { key: "set_on_bench", label: "Set on bench", unit: "rand" },
  { key: "pull_and_align", label: "Pull and align", unit: "rand" },
  { key: "naja_body_measurement", label: "Naja body measurement", unit: "rand" },
  { key: "set_on_jig", label: "Set on jig / jig hire", unit: "rand" },
  { key: "rust_proofing", label: "Rust proofing", unit: "rand" },
  { key: "seam_sealer", label: "Seam sealer", unit: "rand" },
];

/** The warranty blocks, in the order they're shown. Aluminium is opt-in. */
export const WARRANTY_SCOPES: RateScope[] = ["in_warranty", "out_of_warranty", "aluminium"];

export function fieldsFor(scope: RateScope): RateField[] {
  return scope === "general" ? GENERAL_FIELDS : SCOPED_FIELDS;
}

/** True when `key` is a real field in `scope` — anything else is rejected on save. */
export function isKnownField(scope: RateScope, key: string): boolean {
  return fieldsFor(scope).some((f) => f.key === key);
}

/** How each unit is labelled next to an input. */
export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  rand_per_hour: "R / hour",
  rand: "R",
  percent: "%",
};

/** Format a stored value for display given its unit. */
export function formatRate(value: number | undefined, unit: RateUnit): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (unit === "percent") return `${value}%`;
  const amount = value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R ${amount}`;
}
