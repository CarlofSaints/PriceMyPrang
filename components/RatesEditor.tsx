"use client";

import { useMemo, useState } from "react";
import type { RateType } from "@/lib/types";
import { RATE_UNIT_LABELS, sortRateTypes } from "@/lib/rateTypes";
import { Button, inputClass } from "./ui";

export interface RatesPanelBeater {
  id: string;
  name: string;
  rates: Record<string, number>;
}

export default function RatesEditor({
  rateTypes,
  panelBeaters,
  canManage,
}: {
  rateTypes: RateType[];
  panelBeaters: RatesPanelBeater[];
  canManage: boolean;
}) {
  const [pbs, setPbs] = useState<RatesPanelBeater[]>(panelBeaters);
  const [selectedId, setSelectedId] = useState<string>(panelBeaters[0]?.id ?? "");
  const selected = pbs.find((p) => p.id === selectedId) ?? null;

  // String-keyed form values for the selected panel beater.
  const [values, setValues] = useState<Record<string, string>>(() =>
    toStrings(panelBeaters[0]?.rates ?? {})
  );
  const [busy, setBusy] = useState(false);
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

  function selectPb(id: string) {
    setSelectedId(id);
    setValues(toStrings(pbs.find((p) => p.id === id)?.rates ?? {}));
    setMsg(null);
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    // Build a clean numeric payload; blanks are omitted (nothing is mandatory).
    const rates: Record<string, number> = {};
    for (const [id, raw] of Object.entries(values)) {
      const s = raw.trim();
      if (s === "") continue;
      const n = Number(s);
      if (Number.isFinite(n) && n >= 0) rates[id] = n;
    }
    try {
      const res = await fetch("/api/panel-beaters/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelBeaterId: selected.id, rates }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const data = (await res.json()) as { rates: Record<string, number> };
      setPbs((list) =>
        list.map((p) => (p.id === selected.id ? { ...p, rates: data.rates } : p))
      );
      setMsg({ ok: true, text: "Rates saved." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!selected) {
    return (
      <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
        {canManage
          ? "No panel beaters exist yet. Add one under Panel beaters first."
          : "You don't have a panel beater listing yet. Create yours under Panel beaters, then set your rates here."}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {canManage && pbs.length > 0 && (
        <div className="pmp-card">
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            Panel beater
          </label>
          <select
            className={inputClass}
            value={selectedId}
            onChange={(e) => selectPb(e.target.value)}
          >
            {pbs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {groups.map(([groupName, list]) => (
        <div key={groupName} className="pmp-card">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">{groupName}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((rate) => {
              const isPercent = rate.unit === "percent";
              return (
                <label key={rate.id} className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-ink">{rate.label}</span>
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
                  <span className="mt-1 block text-xs text-ink/50">{RATE_UNIT_LABELS[rate.unit]}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={busy} size="lg">
          {busy ? "Saving…" : "Save rates"}
        </Button>
        {msg && (
          <span className={`text-sm font-semibold ${msg.ok ? "text-teal" : "text-coral"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
