"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RateScope } from "@/lib/rateCard";
import type { CustomRateType, RateCard, RateUnit, RateValues } from "@/lib/types";
import { customFieldKey } from "@/lib/rateCard";
import RateValuesEditor from "./RateValuesEditor";
import { Button, Field, inputClass } from "./ui";

export interface RatesPanelBeater {
  id: string;
  name: string;
}

function blankCard(panelBeaterId: string): RateCard {
  return {
    id: "",
    panelBeaterId,
    kind: "cash",
    aluminium: false,
    values: {},
    createdAt: new Date().toISOString(),
  };
}

export default function RatesEditor({
  panelBeaters,
  insurers,
  initialCards,
  initialCustomTypes = [],
  canManage,
}: {
  panelBeaters: RatesPanelBeater[];
  insurers: { id: string; name: string }[];
  initialCards: RateCard[];
  /** The workshop's own rates — shared across all of their cards. */
  initialCustomTypes?: CustomRateType[];
  /** Managers can switch between workshops; a panel beater sees only their own. */
  canManage: boolean;
}) {
  const router = useRouter();

  const [pbId, setPbId] = useState(panelBeaters[0]?.id ?? "");
  const [cards, setCards] = useState<RateCard[]>(initialCards);
  const [customTypes, setCustomTypes] = useState<CustomRateType[]>(initialCustomTypes);
  const [draft, setDraft] = useState<RateCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cardTitle = (c: RateCard) =>
    c.kind === "cash" ? "Cash rates" : `${c.insurerName || "Insurer"} rates`;

  async function loadFor(nextPbId: string) {
    setPbId(nextPbId);
    setDraft(null);
    setError(null);
    const qs = `panelBeaterId=${encodeURIComponent(nextPbId)}`;
    try {
      // Both belong to the workshop being switched to — loading one without the
      // other would price this workshop's cards against the last one's rates.
      const [cardRes, customRes] = await Promise.all([
        fetch(`/api/rate-cards?${qs}`),
        fetch(`/api/rate-cards/custom-types?${qs}`),
      ]);
      setCards(cardRes.ok ? await cardRes.json() : []);
      setCustomTypes(customRes.ok ? await customRes.json() : []);
    } catch {
      setCards([]);
      setCustomTypes([]);
    }
  }

  /** Define a new custom rate. Returns an error message, or null on success. */
  async function addCustomType(label: string, unit: RateUnit): Promise<string | null> {
    try {
      const res = await fetch("/api/rate-cards/custom-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelBeaterId: pbId, label, unit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || "Couldn't add that rate.";
      setCustomTypes((list) => [...list, data as CustomRateType]);
      return null;
    } catch {
      return "Couldn't add that rate. Please try again.";
    }
  }

  /**
   * Remove a custom rate from the workshop entirely.
   *
   * Confirmed because it is NOT scoped to the card on screen — it takes the
   * rate, and any value set for it, off every card the workshop has.
   */
  async function deleteCustomType(type: CustomRateType) {
    if (
      !confirm(
        `Remove "${type.label}"?\n\nIt disappears from every one of your rate cards, along with any amount you've set for it.`
      )
    )
      return;

    const res = await fetch(
      `/api/rate-cards/custom-types?id=${encodeURIComponent(type.id)}&panelBeaterId=${encodeURIComponent(pbId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't remove that rate.");
      return;
    }
    setCustomTypes((list) => list.filter((c) => c.id !== type.id));
    // Drop it from the open draft too, or saving would re-post a value for a
    // rate that no longer exists — the server drops it, but the box would sit
    // there filled in until the next reload, looking saved.
    setDraft((d) => {
      if (!d) return d;
      const general = { ...(d.values.general ?? {}) };
      delete general[customFieldKey(type.id)];
      return { ...d, values: { ...d.values, general } };
    });
    await loadFor(pbId);
  }

  function setValue(scope: RateScope, field: string, raw: string) {
    setDraft((d) => {
      if (!d) return d;
      const values: RateValues = { ...d.values, [scope]: { ...(d.values[scope] ?? {}) } };
      const block = values[scope]!;
      // An emptied box means "I don't charge this", not zero.
      if (raw.trim() === "") delete block[field];
      else block[field] = Number(raw);
      return { ...d, values };
    });
  }

  async function save() {
    if (!draft) return;
    if (draft.kind === "insurance" && !draft.insurerName?.trim()) {
      setError("Enter the insurance company name for this card.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          panelBeaterId: pbId,
          kind: draft.kind,
          insurerName: draft.insurerName,
          aluminium: draft.aluminium,
          values: draft.values,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that rate card.");
        return;
      }
      setDraft(null);
      setNotice("Rate card saved.");
      await loadFor(pbId);
      router.refresh();
    } catch {
      setError("Couldn't save that rate card. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rate-cards?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't delete that rate card.");
        return;
      }
      await loadFor(pbId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (panelBeaters.length === 0) {
    return (
      <div className="pmp-card text-center text-ink/60">
        No workshop is linked to your login yet, so there&apos;s nothing to price.
      </div>
    );
  }

  const isInsurance = draft?.kind === "insurance";

  return (
    <div className="space-y-6">
      {canManage && panelBeaters.length > 1 && (
        <Field label="Workshop">
          <select className={inputClass} value={pbId} onChange={(e) => loadFor(e.target.value)}>
            {panelBeaters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      {!draft && (
        <>
          <div className="space-y-3">
            {cards.length === 0 && (
              <div className="pmp-card text-center text-ink/60">
                No rate cards yet. Add your cash rates, plus one card for each insurer you work
                with.
              </div>
            )}
            {cards.map((c) => (
              <div key={c.id} className="pmp-card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">{cardTitle(c)}</h3>
                  <p className="text-xs text-ink/50">
                    {c.kind === "cash"
                      ? "The client pays directly."
                      : "Rates agreed with this insurer."}
                    {c.aluminium ? " · Includes aluminium" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDraft(c)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => remove(c.id)} disabled={busy}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={() => setDraft(blankCard(pbId))}>+ Add a new rate</Button>
        </>
      )}

      {draft && (
        <div className="pmp-card space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-ink">
              {draft.id ? cardTitle(draft) : "New rate card"}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-ink/40 hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance or cash" required>
              <select
                className={inputClass}
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as "cash" | "insurance",
                    insurerName: undefined,
                  })
                }
              >
                <option value="cash">Cash — the client pays directly</option>
                <option value="insurance">Insurance</option>
              </select>
            </Field>

            {isInsurance && (
              <Field
                label="Insurance company name"
                required
                hint="These are the rates you have agreed with this insurer."
              >
                <input
                  className={inputClass}
                  list="pmp-insurers"
                  value={draft.insurerName ?? ""}
                  onChange={(e) => setDraft({ ...draft, insurerName: e.target.value })}
                  placeholder="e.g. Hollard"
                />
                {/* Suggestions only — the name is free text, because a workshop
                    may hold an SLA with an insurer we haven't listed. */}
                <datalist id="pmp-insurers">
                  {insurers.map((i) => (
                    <option key={i.id} value={i.name} />
                  ))}
                </datalist>
              </Field>
            )}
          </div>

          <RateValuesEditor
            values={draft.values}
            aluminium={draft.aluminium}
            onAluminium={(on) => setDraft({ ...draft, aluminium: on })}
            onChange={setValue}
            customTypes={customTypes}
            onAddCustom={addCustomType}
            onDeleteCustom={deleteCustomType}
          />

          <div className="flex gap-3">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save rate card"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
