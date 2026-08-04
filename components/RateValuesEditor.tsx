"use client";

import { useState } from "react";
import {
  GENERAL_FIELDS,
  RATE_UNIT_LABELS,
  SCOPED_FIELDS,
  SCOPE_LABELS,
  customFieldKey,
  type RateScope,
} from "@/lib/rateCard";
import type { CustomRateType, RateUnit, RateValues } from "@/lib/types";
import { Button, inputClass } from "./ui";

/** What the unit dropdown offers, in the client's words. */
const UNIT_CHOICES: { value: RateUnit; label: string }[] = [
  { value: "rand_per_hour", label: "Per hour" },
  { value: "rand", label: "Fixed price" },
  { value: "percent", label: "Percentage" },
];

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
  customTypes = [],
  onAddCustom,
  onDeleteCustom,
}: {
  values: RateValues;
  aluminium: boolean;
  onAluminium: (on: boolean) => void;
  onChange: (scope: RateScope, field: string, value: string) => void;
  /** Insurance cards show the insurer's numbers but can't edit them. */
  readOnly?: boolean;
  /**
   * The workshop's own custom rates. Defined once for the workshop, so adding
   * or removing one affects EVERY card — which is why the section says so.
   */
  customTypes?: CustomRateType[];
  /** Returns an error message, or null when it saved. */
  onAddCustom?: (label: string, unit: RateUnit) => Promise<string | null>;
  onDeleteCustom?: (type: CustomRateType) => Promise<void>;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newUnit, setNewUnit] = useState<RateUnit>("rand_per_hour");
  const [customError, setCustomError] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);

  async function addCustom() {
    if (!onAddCustom) return;
    const label = newLabel.trim();
    if (!label) return setCustomError("Give the rate a name.");
    setAddingCustom(true);
    setCustomError(null);
    const err = await onAddCustom(label, newUnit);
    if (err) setCustomError(err);
    else {
      setNewLabel("");
      setNewUnit("rand_per_hour");
    }
    setAddingCustom(false);
  }
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

          {/* The workshop's own rates, priced per card like any other. */}
          {customTypes.map((c) => {
            const key = customFieldKey(c.id);
            return (
              <label key={c.id} className="block">
                <span className="mb-1 flex items-center gap-2 text-sm text-ink/70">
                  <span className="truncate">{c.label}</span>
                  <span className="shrink-0 rounded-full bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal">
                    yours
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    disabled={readOnly}
                    value={values.general?.[key] ?? ""}
                    onChange={(e) => onChange("general", key, e.target.value)}
                  />
                  <span className="whitespace-nowrap text-xs text-ink/50">
                    {RATE_UNIT_LABELS[c.unit]}
                  </span>
                  {!readOnly && onDeleteCustom && (
                    <button
                      type="button"
                      title={`Remove "${c.label}" from every one of your rate cards`}
                      onClick={() => onDeleteCustom(c)}
                      className="shrink-0 text-xs font-semibold text-coral hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {/* Add your own. Deliberately at the BOTTOM of General rates — this is
            where the client asked for it, and it reads as "and anything else
            you charge for" after the fixed list. */}
        {!readOnly && onAddCustom && (
          <div className="mt-4 border-t border-teal/15 pt-4">
            <p className="mb-1 text-sm font-semibold text-ink">Add your own rate</p>
            <p className="mb-3 text-xs text-ink/50">
              Anything you charge for that isn&apos;t listed above. It joins your General rates
              on <strong>every</strong> rate card you have, so you can price it differently for
              each insurer.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputClass}
                placeholder="What do you call it? e.g. Polishing"
                maxLength={60}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  // Enter would otherwise submit the surrounding card form and
                  // save the whole card instead of adding the rate.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <select
                className={`${inputClass} sm:w-44`}
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value as RateUnit)}
              >
                {UNIT_CHOICES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={addCustom}
                disabled={addingCustom}
              >
                {addingCustom ? "Adding…" : "Add rate"}
              </Button>
            </div>
            {customError && <p className="mt-2 text-sm text-coral">{customError}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
