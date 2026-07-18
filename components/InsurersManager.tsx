"use client";

import { useMemo, useState } from "react";
import type { InsuranceCompany, RateType } from "@/lib/types";
import { RATE_UNIT_LABELS, sortRateTypes } from "@/lib/rateTypes";
import { Button, Field, inputClass } from "./ui";

export default function InsurersManager({
  initial,
  rateTypes,
}: {
  initial: InsuranceCompany[];
  rateTypes: RateType[];
}) {
  const [insurers, setInsurers] = useState<InsuranceCompany[]>(initial);
  const [selectedId, setSelectedId] = useState<string>(initial[0]?.id ?? "");
  const selected = insurers.find((i) => i.id === selectedId) ?? null;

  const [values, setValues] = useState<Record<string, string>>(() =>
    toStrings(initial[0]?.rates ?? {})
  );
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const groups = useMemo(() => {
    const sorted = sortRateTypes(rateTypes);
    const map = new Map<string, RateType[]>();
    for (const r of sorted) {
      const key = r.group?.trim() || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rateTypes]);

  function toStrings(rates: Record<string, number>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rates)) out[k] = String(v);
    return out;
  }

  function selectInsurer(id: string) {
    setSelectedId(id);
    setValues(toStrings(insurers.find((i) => i.id === id)?.rates ?? {}));
    setMsg(null);
  }

  async function createInsurer(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/insurers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const insurer = (await res.json()) as InsuranceCompany;
      setInsurers((list) => [...list, insurer]);
      setNewName("");
      selectInsurerFrom([...insurers, insurer], insurer.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function selectInsurerFrom(list: InsuranceCompany[], id: string) {
    setSelectedId(id);
    setValues(toStrings(list.find((i) => i.id === id)?.rates ?? {}));
    setMsg(null);
  }

  async function patch(id: string, changes: Partial<InsuranceCompany>) {
    const prev = insurers;
    setInsurers((list) => list.map((i) => (i.id === id ? { ...i, ...changes } : i)));
    setError(null);
    try {
      const res = await fetch("/api/insurers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as InsuranceCompany;
      setInsurers((list) => list.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) {
      setInsurers(prev);
      setError((err as Error).message);
    }
  }

  async function deleteInsurer(insurer: InsuranceCompany) {
    if (!confirm(`Delete "${insurer.name}" and its rates?`)) return;
    setError(null);
    const res = await fetch("/api/insurers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: insurer.id }),
    });
    if (res.ok) {
      const remaining = insurers.filter((i) => i.id !== insurer.id);
      setInsurers(remaining);
      selectInsurerFrom(remaining, remaining[0]?.id ?? "");
    } else {
      setError((await res.json()).error || "Delete failed");
    }
  }

  async function saveRates() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    const rates: Record<string, number> = {};
    for (const [id, raw] of Object.entries(values)) {
      const s = raw.trim();
      if (s === "") continue;
      const n = Number(s);
      if (Number.isFinite(n) && n >= 0) rates[id] = n;
    }
    try {
      const res = await fetch("/api/insurers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, rates }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as InsuranceCompany;
      setInsurers((list) => list.map((i) => (i.id === updated.id ? updated : i)));
      setMsg({ ok: true, text: "Rates saved." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      {/* Add an insurance company */}
      <form onSubmit={createInsurer} className="pmp-card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Field label="Add an insurance company">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Santam"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Adding…" : "+ Add insurer"}
        </Button>
      </form>

      {insurers.length === 0 ? (
        <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
          No insurance companies yet. Add one above to start setting rates.
        </p>
      ) : (
        <>
          {/* Pick + manage the selected insurer */}
          <div className="pmp-card space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Insurance company
              </label>
              <select
                className={inputClass}
                value={selectedId}
                onChange={(e) => selectInsurer(e.target.value)}
              >
                {insurers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">
                    Name
                  </label>
                  <input
                    className={inputClass}
                    defaultValue={selected.name}
                    key={selected.id}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== selected.name) patch(selected.id, { name: v });
                      else e.target.value = selected.name;
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink/70">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#00848d]"
                    checked={selected.active}
                    onChange={(e) => patch(selected.id, { active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => deleteInsurer(selected)}
                  className="text-xs font-semibold text-coral hover:underline"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Rate card for the selected insurer */}
          {selected &&
            (groups.length === 0 ? (
              <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
                No active rate types yet. Add some under Rate types first.
              </p>
            ) : (
              <>
                {groups.map(([groupName, list]) => (
                  <div key={groupName} className="pmp-card">
                    <h2 className="mb-4 font-display text-lg font-semibold text-ink">{groupName}</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {list.map((rate) => {
                        const isPercent = rate.unit === "percent";
                        return (
                          <label key={rate.id} className="block">
                            <span className="mb-1.5 block text-sm font-semibold text-ink">
                              {rate.label}
                            </span>
                            <div className="relative">
                              {!isPercent && (
                                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/50">
                                  R
                                </span>
                              )}
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                className={`${inputClass} ${isPercent ? "pr-10" : "pl-8"}`}
                                value={values[rate.id] ?? ""}
                                onChange={(e) =>
                                  setValues((v) => ({ ...v, [rate.id]: e.target.value }))
                                }
                                placeholder="—"
                              />
                              {isPercent && (
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/50">
                                  %
                                </span>
                              )}
                            </div>
                            <span className="mt-1 block text-xs text-ink/50">
                              {RATE_UNIT_LABELS[rate.unit]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-4">
                  <Button onClick={saveRates} disabled={busy} size="lg">
                    {busy ? "Saving…" : "Save rates"}
                  </Button>
                  {msg && (
                    <span className={`text-sm font-semibold ${msg.ok ? "text-teal" : "text-coral"}`}>
                      {msg.text}
                    </span>
                  )}
                </div>
              </>
            ))}
        </>
      )}

      <p className="text-xs text-ink/50">
        These rate cards are shared — every panel beater can see and use an insurer&apos;s rates.
        Name and active changes save automatically; rates save with the button.
      </p>
    </div>
  );
}
