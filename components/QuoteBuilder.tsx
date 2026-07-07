"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuiltQuote, PanelBeater, Part, QuoteLineItem, QuoteRequest } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import { zar } from "@/lib/format";

type Line = QuoteLineItem;

const emptyLine: Line = { name: "", quantity: 1, unitPrice: 0 };

export default function QuoteBuilder({ initialRef }: { initialRef?: string }) {
  const [refInput, setRefInput] = useState(initialRef ?? "");
  const [request, setRequest] = useState<QuoteRequest | null>(null);
  const [panelBeaters, setPanelBeaters] = useState<PanelBeater[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Active quote form
  const [pbId, setPbId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [seniorHours, setSeniorHours] = useState(0);
  const [juniorHours, setJuniorHours] = useState(0);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async (reference: string) => {
    setError(null);
    setLoading(true);
    setRequest(null);
    try {
      const [rReq, rPb, rParts] = await Promise.all([
        fetch(`/api/requests/${encodeURIComponent(reference.trim())}`),
        fetch("/api/panel-beaters"),
        fetch("/api/parts"),
      ]);
      if (!rReq.ok) throw new Error("Request not found — check the reference.");
      const req = (await rReq.json()) as QuoteRequest;
      setRequest(req);
      setPanelBeaters(rPb.ok ? await rPb.json() : []);
      setParts(rParts.ok ? await rParts.json() : []);
      // Preselect the first not-yet-quoted workshop.
      const quotedIds = new Set(req.quotes.map((q) => q.panelBeaterId));
      const next = req.selectedPanelBeaterIds.find((id) => !quotedIds.has(id));
      setPbId(next ?? req.selectedPanelBeaterIds[0] ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialRef) load(initialRef);
  }, [initialRef, load]);

  const pb = panelBeaters.find((x) => x.id === pbId);
  const chosenPbs = request
    ? panelBeaters.filter((x) => request.selectedPanelBeaterIds.includes(x.id))
    : [];

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickPart(i: number, partId: string) {
    const part = parts.find((p) => p.id === partId);
    if (!part) {
      updateLine(i, { partId: undefined, supplier: undefined, name: "", partNumber: undefined });
      return;
    }
    updateLine(i, {
      partId: part.id,
      supplier: part.supplier,
      name: part.name,
      partNumber: part.partNumber,
      unitPrice: part.price,
    });
  }

  const partsTotal = lines.reduce((s, l) => s + (l.unitPrice || 0) * (l.quantity || 0), 0);
  const labourTotal =
    seniorHours * (pb?.labourRateSenior || 0) + juniorHours * (pb?.labourRateJunior || 0);
  const subtotal = partsTotal + labourTotal;
  const total = subtotal * 1.15;

  async function build() {
    if (!request || !pbId) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: request.reference,
          panelBeaterId: pbId,
          parts: lines.filter((l) => l.name.trim()),
          seniorHours,
          juniorHours,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Build failed");
      const quote = (await res.json()) as BuiltQuote;
      // Merge into local request + reset form for the next one.
      setRequest((r) => {
        if (!r) return r;
        const quotes = [...r.quotes.filter((q) => q.panelBeaterId !== quote.panelBeaterId), quote];
        return { ...r, quotes };
      });
      setLines([{ ...emptyLine }]);
      setSeniorHours(0);
      setJuniorHours(0);
      // Advance to next unquoted workshop.
      const quotedIds = new Set([...request.quotes.map((q) => q.panelBeaterId), quote.panelBeaterId]);
      const next = request.selectedPanelBeaterIds.find((id) => !quotedIds.has(id));
      if (next) setPbId(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Reference lookup */}
      <div className="pmp-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <Field label="Reference number" hint="Pulled from the dashboard, or enter it manually.">
              <input
                className={inputClass}
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                placeholder="PMP-YYYYMMDD-SURNAME-01"
              />
            </Field>
          </div>
          <Button onClick={() => load(refInput)} disabled={!refInput.trim() || loading}>
            {loading ? "Loading…" : "Load request"}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-coral">{error}</p>}
      </div>

      {request && (
        <>
          <div className="pmp-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-ink">
                  {request.firstName} {request.lastName}
                </p>
                <p className="text-sm text-ink/60">
                  {[request.vehicle.make, request.vehicle.model, request.vehicle.year]
                    .filter(Boolean)
                    .join(" ") || "Vehicle details pending"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-ink/50">Quotes</p>
                <p className="font-display text-xl font-bold text-ink">
                  {request.quotes.length}/{request.quotesRequested}
                </p>
              </div>
            </div>
            {/* Progress across chosen workshops */}
            <div className="mt-4 flex flex-wrap gap-2">
              {chosenPbs.map((w) => {
                const done = request.quotes.find((q) => q.panelBeaterId === w.id);
                return (
                  <button
                    key={w.id}
                    onClick={() => setPbId(w.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      w.id === pbId
                        ? "bg-teal text-white"
                        : done
                        ? "bg-teal/10 text-teal"
                        : "bg-ink/5 text-ink/70"
                    }`}
                  >
                    {done ? "✓ " : ""}
                    {w.tradingAs || w.companyName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active quote form */}
          <div className="pmp-card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-ink">
                Build quote{request.quotes.some((q) => q.panelBeaterId === pbId) ? " (rebuild)" : ""}
              </h2>
              <div className="min-w-[220px]">
                <select className={inputClass} value={pbId} onChange={(e) => setPbId(e.target.value)}>
                  <option value="">Select panel beater…</option>
                  {chosenPbs.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.tradingAs || w.companyName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {pb && (
              <p className="text-sm text-ink/60">
                Labour rates — senior {pb.labourRateSenior ? zar(pb.labourRateSenior) : "not set"}/hr ·
                junior {pb.labourRateJunior ? zar(pb.labourRateJunior) : "not set"}/hr
              </p>
            )}

            {/* Parts lines */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink">Parts</p>
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select
                    className={`${inputClass} col-span-4`}
                    value={line.partId ?? ""}
                    onChange={(e) => pickPart(i, e.target.value)}
                  >
                    <option value="">— manual entry —</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.supplier}: {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} col-span-3`}
                    placeholder="Part name"
                    value={line.name}
                    onChange={(e) => updateLine(i, { name: e.target.value })}
                  />
                  <input
                    className={`${inputClass} col-span-2`}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                  />
                  <input
                    className={`${inputClass} col-span-2`}
                    type="number"
                    step="0.01"
                    placeholder="Unit R"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    className="col-span-1 text-coral"
                    aria-label="Remove line"
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button variant="outline" size="md" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>
                + Add part
              </Button>
            </div>

            {/* Labour */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated senior labour hours">
                <input
                  className={inputClass}
                  type="number"
                  step="0.5"
                  value={seniorHours}
                  onChange={(e) => setSeniorHours(Number(e.target.value))}
                />
              </Field>
              <Field label="Estimated junior labour hours">
                <input
                  className={inputClass}
                  type="number"
                  step="0.5"
                  value={juniorHours}
                  onChange={(e) => setJuniorHours(Number(e.target.value))}
                />
              </Field>
            </div>

            {/* Totals preview */}
            <div className="rounded-xl bg-offwhite p-4 text-sm">
              <div className="flex justify-between"><span>Parts</span><span>{zar(partsTotal)}</span></div>
              <div className="flex justify-between"><span>Labour</span><span>{zar(labourTotal)}</span></div>
              <div className="flex justify-between"><span>Subtotal</span><span>{zar(subtotal)}</span></div>
              <div className="flex justify-between"><span>VAT (15%)</span><span>{zar(subtotal * 0.15)}</span></div>
              <div className="mt-1 flex justify-between border-t border-teal/20 pt-1 font-display text-base font-bold text-teal">
                <span>Total</span><span>{zar(total)}</span>
              </div>
            </div>

            {error && <p className="text-sm text-coral">{error}</p>}

            <Button size="lg" onClick={build} disabled={!pbId || building}>
              {building ? "Building PDF…" : "Build quote"}
            </Button>
          </div>

          {/* Built quotes */}
          {request.quotes.length > 0 && (
            <div className="pmp-card">
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Built quotes</h2>
              <ul className="space-y-2">
                {request.quotes.map((q) => {
                  const w = panelBeaters.find((x) => x.id === q.panelBeaterId);
                  return (
                    <li
                      key={q.id}
                      className="flex items-center justify-between rounded-lg border border-teal/15 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-ink">
                          {w ? w.tradingAs || w.companyName : q.panelBeaterId}
                        </p>
                        <p className="text-sm text-ink/60">{zar(q.total)}</p>
                      </div>
                      {q.pdfUrl && (
                        <a
                          href={q.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-teal hover:underline"
                        >
                          Download quote from {w ? w.tradingAs || w.companyName : "workshop"}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
