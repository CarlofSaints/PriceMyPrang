"use client";

import { useState } from "react";
import type { InsuranceCompany } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

/**
 * The list of insurers a consumer picks from when requesting a quote.
 *
 * There is deliberately no rate card here: rates are negotiated between each
 * repairer and each insurer, so they live on the workshop's own rate card
 * (Rates page) and differ from workshop to workshop.
 */
/** A name a consumer typed into "Other", not yet a real insurer. */
export interface InsurerSuggestion {
  name: string;
  count: number;
  lastSeen: string;
}

export default function InsurersManager({
  initial,
  suggestions = [],
}: {
  initial: InsuranceCompany[];
  suggestions?: InsurerSuggestion[];
}) {
  const [insurers, setInsurers] = useState<InsuranceCompany[]>(initial);
  const [pending, setPending] = useState<InsurerSuggestion[]>(suggestions);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Shared by the add form and the one-click accept on a suggestion. */
  async function addInsurer(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setError(null);
    try {
      const res = await fetch("/api/insurers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const insurer = (await res.json()) as InsuranceCompany;
      setInsurers((list) => [...list, insurer].sort((a, b) => a.name.localeCompare(b.name)));
      // Drop any suggestion that now matches — it has become a real option.
      setPending((list) => list.filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase()));
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }

  async function createInsurer(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    if (await addInsurer(newName)) setNewName("");
    setCreating(false);
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
    } catch (err) {
      setInsurers(prev);
      setError((err as Error).message);
    }
  }

  async function deleteInsurer(insurer: InsuranceCompany) {
    if (!confirm(`Delete "${insurer.name}"?`)) return;
    setError(null);
    const res = await fetch("/api/insurers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: insurer.id }),
    });
    if (res.ok) setInsurers((list) => list.filter((i) => i.id !== insurer.id));
    else setError((await res.json()).error || "Delete failed");
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4">
          <p className="font-display text-base font-semibold text-ink">
            Insurers customers asked for
          </p>
          <p className="mt-1 text-sm text-ink/70">
            These were typed into &ldquo;Other / not listed&rdquo; on a quote request and still
            aren&apos;t on your list. Nothing has been added automatically — check each one is a
            real insurer (and spelled properly) before accepting it.
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map((s) => (
              <li
                key={s.name}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2"
              >
                <span className="font-semibold text-ink">{s.name}</span>
                <span className="text-xs text-ink/50">
                  asked for {s.count} {s.count === 1 ? "time" : "times"}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="md" onClick={() => addInsurer(s.name)}>
                    Add to list
                  </Button>
                  <button
                    type="button"
                    className="text-sm text-ink/50 underline"
                    onClick={() =>
                      setPending((list) => list.filter((p) => p.name !== s.name))
                    }
                  >
                    Ignore
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink/50">
            &ldquo;Ignore&rdquo; only hides it until you reload — it doesn&apos;t change the
            customer&apos;s request.
          </p>
        </div>
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
          No insurance companies yet. Consumers won&apos;t see a dropdown until you add some.
        </p>
      ) : (
        <div className="pmp-card overflow-hidden p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Insurance company</th>
                <th className="px-4 py-3">Shown to consumers</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {insurers.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <input
                      className={inputClass}
                      defaultValue={i.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== i.name) patch(i.id, { name: v });
                        else e.target.value = i.name;
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2 text-sm text-ink/70">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#00848d]"
                        checked={i.active}
                        onChange={(e) => patch(i.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => deleteInsurer(i)}
                      className="text-xs font-semibold text-coral hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink/50">
        Rates aren&apos;t set here. Each panel beater negotiates its own rates with each insurer,
        so they&apos;re captured on that workshop&apos;s Rates page.
      </p>
    </div>
  );
}
