"use client";

import { useMemo, useState } from "react";
import type { RateType, RateUnit } from "@/lib/types";
import { RATE_UNIT_OPTIONS, sortRateTypes } from "@/lib/rateTypes";
import { Button, Field, inputClass } from "./ui";

export default function RateTypesManager({ initial }: { initial: RateType[] }) {
  const [rates, setRates] = useState<RateType[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Add form
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState<RateUnit>("rand_per_hour");
  const [group, setGroup] = useState("");
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const sorted = sortRateTypes(rates);
    const map = new Map<string, RateType[]>();
    for (const r of sorted) {
      const key = r.group?.trim() || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rates]);

  // Existing group names, for the datalist on the add form.
  const groupNames = useMemo(
    () => [...new Set(rates.map((r) => r.group?.trim()).filter(Boolean))] as string[],
    [rates]
  );

  async function patch(id: string, changes: Partial<RateType>) {
    const prev = rates;
    setRates((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch("/api/rate-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as RateType;
      setRates((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setRates(prev); // revert
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function createRate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rate-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, unit, group }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const rate = (await res.json()) as RateType;
      setRates((r) => [...r, rate]);
      setLabel("");
      setGroup("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteRate(rate: RateType) {
    if (!confirm(`Delete the "${rate.label}" rate type? Panel beaters will no longer be able to set it.`))
      return;
    setError(null);
    const res = await fetch("/api/rate-types", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rate.id }),
    });
    if (res.ok) setRates((rs) => rs.filter((r) => r.id !== rate.id));
    else setError((await res.json()).error || "Delete failed");
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      {/* Add a rate type */}
      <form onSubmit={createRate} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">Add a rate type</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rate name" required>
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Structural labour rate"
              required
            />
          </Field>
          <Field label="Unit">
            <select
              className={inputClass}
              value={unit}
              onChange={(e) => setUnit(e.target.value as RateUnit)}
            >
              {RATE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group" hint="Groups the rate on the panel beater Rates page.">
            <input
              className={inputClass}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="e.g. Labour & paint"
              list="rate-groups"
            />
            <datalist id="rate-groups">
              {groupNames.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Adding…" : "+ Add rate type"}
        </Button>
      </form>

      {/* Existing rate types, grouped */}
      {grouped.map(([groupName, list]) => (
        <div key={groupName} className="pmp-card p-0 overflow-hidden">
          <div className="border-b border-ink/5 bg-ink/5 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink/60">
            {groupName}
          </div>
          <ul className="divide-y divide-ink/5">
            {list.map((rate) => (
              <li key={rate.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <input
                  className={`${inputClass} flex-1 min-w-[200px] ${rate.active ? "" : "opacity-50"}`}
                  defaultValue={rate.label}
                  disabled={savingId === rate.id}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== rate.label) patch(rate.id, { label: v });
                    else e.target.value = rate.label;
                  }}
                  aria-label="Rate name"
                />
                <select
                  className={`${inputClass} w-44`}
                  value={rate.unit}
                  disabled={savingId === rate.id}
                  onChange={(e) => patch(rate.id, { unit: e.target.value as RateUnit })}
                  aria-label="Unit"
                >
                  {RATE_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#00848d]"
                    checked={rate.active}
                    disabled={savingId === rate.id}
                    onChange={(e) => patch(rate.id, { active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => deleteRate(rate)}
                  className="text-xs font-semibold text-coral hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="text-xs text-ink/50">
        Changes save automatically. Active rate types appear on the panel beater{" "}
        <strong>Rates</strong> page. Inactive ones are hidden but keep any values already saved.
      </p>
    </div>
  );
}
