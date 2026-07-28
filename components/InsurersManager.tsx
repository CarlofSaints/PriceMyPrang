"use client";

import { useState } from "react";
import type { RateScope } from "@/lib/rateCard";
import type { InsuranceCompany, RateValues } from "@/lib/types";
import RateValuesEditor from "./RateValuesEditor";
import { Button, Field, inputClass } from "./ui";

/**
 * Super Admin view of an insurer's central rate card. Every workshop that adds
 * an insurance card for this insurer inherits exactly these numbers, so this is
 * the only place they can be changed.
 */
export default function InsurersManager({ initial }: { initial: InsuranceCompany[] }) {
  const [insurers, setInsurers] = useState<InsuranceCompany[]>(initial);
  const [selectedId, setSelectedId] = useState<string>(initial[0]?.id ?? "");
  const selected = insurers.find((i) => i.id === selectedId) ?? null;

  const [values, setValues] = useState<RateValues>(initial[0]?.rates ?? {});
  const [aluminium, setAluminium] = useState<boolean>(initial[0]?.aluminium ?? false);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function selectFrom(list: InsuranceCompany[], id: string) {
    const insurer = list.find((i) => i.id === id);
    setSelectedId(id);
    setValues(insurer?.rates ?? {});
    setAluminium(insurer?.aluminium ?? false);
    setMsg(null);
  }

  function setValue(scope: RateScope, field: string, raw: string) {
    setValues((v) => {
      const next: RateValues = { ...v, [scope]: { ...(v[scope] ?? {}) } };
      const block = next[scope]!;
      // Blank means "not charged", which is different from zero.
      if (raw.trim() === "") delete block[field];
      else block[field] = Number(raw);
      return next;
    });
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
      const list = [...insurers, insurer];
      setInsurers(list);
      setNewName("");
      selectFrom(list, insurer.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
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
      selectFrom(remaining, remaining[0]?.id ?? "");
    } else {
      setError((await res.json()).error || "Delete failed");
    }
  }

  async function saveRates() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/insurers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, rates: values, aluminium }),
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
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      <form onSubmit={createInsurer} className="pmp-card flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
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
          <div className="pmp-card space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Insurance company
              </label>
              <select
                className={inputClass}
                value={selectedId}
                onChange={(e) => selectFrom(insurers, e.target.value)}
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
                <div className="min-w-[200px] flex-1">
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

          {selected && (
            <div className="pmp-card space-y-5">
              <h2 className="font-display text-lg font-semibold text-ink">
                {selected.name} rate card
              </h2>
              <RateValuesEditor
                values={values}
                aluminium={aluminium}
                onAluminium={setAluminium}
                onChange={setValue}
              />
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
            </div>
          )}
        </>
      )}

      <p className="text-xs text-ink/50">
        These rate cards are shared — a panel beater who adds a card for this insurer inherits
        exactly these rates and cannot change them. Name and active changes save automatically;
        rates save with the button.
      </p>
    </div>
  );
}
