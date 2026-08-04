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

/**
 * Charged the same however the job is funded, so they sit outside the blocks.
 *
 * "Mechanical / suspension" and "Cut & weld" were removed on 4 Aug 2026 — the
 * client dropped them in favour of workshop-defined custom rates, which land
 * in this same block. Their stored values were deleted by migration
 * 20260804120000_custom_rate_types.
 */
export const GENERAL_FIELDS: RateField[] = [
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

// ---------------------------------------------------------------------------
// Workshop-defined custom rates.
//
// The catalogue above is fixed in code; these are not. A workshop defines one
// once (custom_rate_types), and it then takes a value on every one of their
// cards — an insurer may pay a different number for the same custom item.
//
// The value rides in rate_card_values like everything else, keyed
// `custom:<uuid>` under the general scope, so there is still ONE table of
// rates for Power BI to read. The prefix is what keeps a custom key from ever
// colliding with a catalogue key, now or when the catalogue grows.
// ---------------------------------------------------------------------------

export const CUSTOM_FIELD_PREFIX = "custom:";

/** The rate_card_values.field key holding this custom rate's value. */
export const customFieldKey = (id: string): string => `${CUSTOM_FIELD_PREFIX}${id}`;

/** True for a custom key. Its id is whatever follows the prefix. */
export const isCustomFieldKey = (key: string): boolean => key.startsWith(CUSTOM_FIELD_PREFIX);

/** The custom rate type id inside a key, or null if it isn't one. */
export const customTypeId = (key: string): string | null =>
  isCustomFieldKey(key) ? key.slice(CUSTOM_FIELD_PREFIX.length) || null : null;

/**
 * True when `key` is a real field in `scope` — anything else is rejected on save.
 *
 * Custom keys are accepted in `general` ONLY, which is where the client asked
 * for them to live. This deliberately does not check the id against
 * custom_rate_types: that lookup is per-workshop and belongs in the store,
 * where the card's owner is known.
 */
export function isKnownField(scope: RateScope, key: string): boolean {
  if (isCustomFieldKey(key)) return scope === "general" && key.length > CUSTOM_FIELD_PREFIX.length;
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
