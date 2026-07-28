"use client";

import {
  GENERAL_FIELDS,
  RATE_UNIT_LABELS,
  SCOPED_FIELDS,
  SCOPE_LABELS,
  type RateScope,
} from "@/lib/rateCard";
import type { RateValues } from "@/lib/types";
import { inputClass } from "./ui";

/**
 * The blocks of a rate card — In warranty, Out of warranty, optional Aluminium,
 * and card-level General rates. Shared by the workshop's own editor and the
 * Super Admin's insurer editor so the two can never drift apart.
 */
export default function RateValuesEditor({
  values,
  aluminium,
  onAluminium,
  onChange,
  readOnly = false,
}: {
  values: RateValues;
  aluminium: boolean;
  onAluminium: (on: boolean) => void;
  onChange: (scope: RateScope, field: string, value: string) => void;
  /** Insurance cards show the insurer's numbers but can't edit them. */
  readOnly?: boolean;
}) {
  const scopes: RateScope[] = aluminium
    ? ["in_warranty", "out_of_warranty", "aluminium"]
    : ["in_warranty", "out_of_warranty"];

  return (
    <div className="space-y-5">
      {scopes.map((scope) => (
        <section key={scope} className="rounded-xl border border-teal/20 bg-offwhite/40 p-4">
          <h4 className="mb-3 font-display font-semibold text-ink">{SCOPE_LABELS[scope]}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCOPED_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm text-ink/70">{f.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={values[scope]?.[f.key] ?? ""}
                    onChange={(e) => onChange(scope, f.key, e.target.value)}
                  />
                  <span className="whitespace-nowrap text-xs text-ink/50">
                    {RATE_UNIT_LABELS[f.unit]}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={aluminium}
          disabled={readOnly}
          onChange={(e) => onAluminium(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00848d]"
        />
        <span>
          This card includes aluminium rates
          <span className="block text-xs text-ink/50">
            Adds a third block with its own labour, paint, mark-up and fixed-price rates.
          </span>
        </span>
      </label>

      <section className="rounded-xl border border-teal/20 bg-offwhite/40 p-4">
        <h4 className="mb-1 font-display font-semibold text-ink">{SCOPE_LABELS.general}</h4>
        <p className="mb-3 text-xs text-ink/50">
          Charged the same however the job is funded, so they sit outside the blocks above.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {GENERAL_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-sm text-ink/70">{f.label}</span>
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={values.general?.[f.key] ?? ""}
                  onChange={(e) => onChange("general", f.key, e.target.value)}
                />
                <span className="whitespace-nowrap text-xs text-ink/50">
                  {RATE_UNIT_LABELS[f.unit]}
                </span>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
