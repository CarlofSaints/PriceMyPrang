import type { RateType, RateUnit } from "./types";

// How each unit is labelled / rendered on screen.
export const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  rand_per_hour: "R / hour",
  rand: "R",
  percent: "%",
};

export const RATE_UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: "rand_per_hour", label: "Rand per hour (R/hr)" },
  { value: "rand", label: "Rand value (R)" },
  { value: "percent", label: "Percentage (%)" },
];

/** Format a stored numeric value for display given its unit. */
export function formatRate(value: number | undefined, unit: RateUnit): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (unit === "percent") return `${value}%`;
  const amount = value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R ${amount}`;
}

// Groups shown, in order, on the Rates page.
export const RATE_GROUP_ORDER = [
  "Labour & paint",
  "Diagnostics",
  "Spares mark-up",
  "Rim repair",
] as const;

const SEED_DATE = "2026-01-01T00:00:00.000Z";

function seed(
  id: string,
  label: string,
  unit: RateUnit,
  group: string,
  order: number
): RateType {
  return { id, label, unit, group, order, active: true, system: true, createdAt: SEED_DATE };
}

// Seeded on first run. Super Admins can add/edit/remove these.
export const DEFAULT_RATE_TYPES: RateType[] = [
  // Labour & paint — Rand per hour
  seed("cash_rate", "Cash rate", "rand_per_hour", "Labour & paint", 10),
  seed("labour_in_warranty", "In-warranty labour rate", "rand_per_hour", "Labour & paint", 20),
  seed("labour_out_warranty", "Out-of-warranty labour rate", "rand_per_hour", "Labour & paint", 30),
  seed("labour_aluminium", "Aluminium labour rate", "rand_per_hour", "Labour & paint", 40),
  seed("paint_in_warranty", "In-warranty paint rate", "rand_per_hour", "Labour & paint", 50),
  seed("paint_out_warranty", "Out-of-warranty paint rate", "rand_per_hour", "Labour & paint", 60),
  seed("paint_aluminium", "Aluminium paint rate", "rand_per_hour", "Labour & paint", 70),
  // Diagnostics — Rand value
  seed("diagnostics_in_warranty", "Diagnostics — in warranty", "rand", "Diagnostics", 80),
  seed("diagnostics_out_warranty", "Diagnostics — out of warranty", "rand", "Diagnostics", 90),
  // Spares mark-up — percentage
  seed("markup_oem", "Mark-up on OEM spares", "percent", "Spares mark-up", 100),
  seed("markup_alt", "Mark-up on alternative spares", "percent", "Spares mark-up", 110),
  seed("markup_used", "Mark-up on used spares", "percent", "Spares mark-up", 120),
  // Rim repair — Rand value
  seed("rim_standard", "Rim repair — standard estimate", "rand", "Rim repair", 130),
  seed("rim_diamond_cut", "Rim repair — diamond cut estimate", "rand", "Rim repair", 140),
];

/** Active rate types, sorted by (order, label) for stable display. */
export function sortRateTypes(list: RateType[]): RateType[] {
  return [...list].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}
