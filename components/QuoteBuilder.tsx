"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuiltQuote, PanelBeater, Part, QuoteLineItem, QuoteRequest } from "@/lib/types";
import { QUOTE_LINE_CODES } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import { zar } from "@/lib/format";

type Line = QuoteLineItem;

const emptyLine: Line = {
  code: "",
  description: "",
  quantity: 1,
  partsAmount: 0,
  panelAmount: 0,
  panelHours: 0,
  paintAmount: 0,
  paintHours: 0,
  stripAmount: 0,
  stripHours: 0,
};

// Show a blank input instead of a sticky "0".
const numVal = (n: number) => (n ? String(n) : "");

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
  const [sundries, setSundries] = useState(0);
  const [consumables, setConsumables] = useState(0);
  const [notes, setNotes] = useState("");
  const [building, setBuilding] = useState(false);

  // Load an existing quote for a workshop into the form, else start blank.
  const loadFormFor = useCallback((req: QuoteRequest, id: string) => {
    const existing = req.quotes.find((q) => q.panelBeaterId === id);
    if (existing) {
      setLines(existing.lines.length ? existing.lines.map((l) => ({ ...l })) : [{ ...emptyLine }]);
      setSundries(existing.sundries || 0);
      setConsumables(existing.consumables || 0);
      setNotes(existing.notes || "");
    } else {
      setLines([{ ...emptyLine }]);
      setSundries(0);
      setConsumables(0);
      setNotes("");
    }
  }, []);

  const load = useCallback(
    async (reference: string) => {
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
        const chosen = next ?? req.selectedPanelBeaterIds[0] ?? "";
        setPbId(chosen);
        loadFormFor(req, chosen);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadFormFor]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialRef) load(initialRef);
  }, [initialRef, load]);

  const pb = panelBeaters.find((x) => x.id === pbId);
  const chosenPbs = request
    ? panelBeaters.filter((x) => request.selectedPanelBeaterIds.includes(x.id))
    : [];

  function selectPb(id: string) {
    setPbId(id);
    if (request) loadFormFor(request, id);
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickPart(i: number, partId: string) {
    const part = parts.find((p) => p.id === partId);
    if (!part) {
      updateLine(i, { partId: undefined, supplier: undefined, partNumber: undefined });
      return;
    }
    updateLine(i, {
      partId: part.id,
      supplier: part.supplier,
      partNumber: part.partNumber,
      description: part.name,
      partsAmount: part.price,
      code: emptyLine.code || "New",
    });
  }

  // Live totals
  const partsTotal = lines.reduce((s, l) => s + (Number(l.partsAmount) || 0), 0);
  const panelTotal = lines.reduce((s, l) => s + (Number(l.panelAmount) || 0), 0);
  const paintTotal = lines.reduce((s, l) => s + (Number(l.paintAmount) || 0), 0);
  const stripTotal = lines.reduce((s, l) => s + (Number(l.stripAmount) || 0), 0);
  const labourTotal = panelTotal + paintTotal + stripTotal;
  const subtotal = partsTotal + labourTotal + (Number(sundries) || 0) + (Number(consumables) || 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

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
          lines,
          sundries,
          consumables,
          notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Build failed");
      const quote = (await res.json()) as BuiltQuote;
      // Merge into local request.
      setRequest((r) => {
        if (!r) return r;
        const quotes = [...r.quotes.filter((q) => q.panelBeaterId !== quote.panelBeaterId), quote];
        return { ...r, quotes };
      });
      // Advance to the next unquoted workshop (fresh form), else keep the built one loaded.
      const quotedIds = new Set([
        ...request.quotes.map((q) => q.panelBeaterId),
        quote.panelBeaterId,
      ]);
      const next = request.selectedPanelBeaterIds.find((id) => !quotedIds.has(id));
      if (next && request) {
        setPbId(next);
        loadFormFor(request, next);
      }
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
                    onClick={() => selectPb(w.id)}
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
                <select className={inputClass} value={pbId} onChange={(e) => selectPb(e.target.value)}>
                  <option value="">Select panel beater…</option>
                  {chosenPbs.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.tradingAs || w.companyName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line items */}
            <datalist id="quote-codes">
              {QUOTE_LINE_CODES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <div className="space-y-3">
              {lines.map((line, i) => (
                <LineCard
                  key={i}
                  line={line}
                  parts={parts}
                  onChange={(patch) => updateLine(i, patch)}
                  onPickPart={(id) => pickPart(i, id)}
                  onRemove={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                />
              ))}
              <Button variant="outline" size="md" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>
                + Add line
              </Button>
            </div>

            {/* Sundries / consumables / notes */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sundries (R)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min={0}
                  value={numVal(sundries)}
                  onChange={(e) => setSundries(Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Consumables (R)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min={0}
                  value={numVal(consumables)}
                  onChange={(e) => setConsumables(Number(e.target.value) || 0)}
                />
              </Field>
            </div>
            <Field label="Note to client" hint="Optional — e.g. “Vehicle needs to be stripped for unseen damages.”">
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {pb && !pb.labourRateSenior && (
              <p className="text-xs text-ink/50">
                Tip: {pb.tradingAs || pb.companyName}&apos;s rate card can be set on the Rates page.
              </p>
            )}

            {/* Totals preview */}
            <div className="rounded-xl bg-offwhite p-4 text-sm">
              <TotalRow label="Parts" value={partsTotal} />
              <TotalRow label="Panel beating" value={panelTotal} />
              <TotalRow label="Paint" value={paintTotal} />
              <TotalRow label="Strip & assemble" value={stripTotal} />
              <TotalRow label="Sundries" value={sundries} />
              <TotalRow label="Consumables" value={consumables} />
              <div className="mt-1 border-t border-teal/15 pt-1">
                <TotalRow label="Total ex VAT" value={subtotal} />
                <TotalRow label="VAT (15%)" value={vat} />
              </div>
              <div className="mt-1 flex justify-between border-t border-teal/20 pt-1 font-display text-base font-bold text-teal">
                <span>Total incl VAT</span>
                <span>{zar(total)}</span>
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
                        <p className="text-sm text-ink/60">{zar(q.total)} incl VAT</p>
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

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{zar(value)}</span>
    </div>
  );
}

function LineCard({
  line,
  parts,
  onChange,
  onPickPart,
  onRemove,
}: {
  line: Line;
  parts: Part[];
  onChange: (patch: Partial<Line>) => void;
  onPickPart: (partId: string) => void;
  onRemove: () => void;
}) {
  const cat = "rounded-xl border border-teal/15 bg-offwhite/40 p-3";
  return (
    <div className="rounded-2xl border border-teal/15 bg-white p-3">
      {/* Line basics */}
      <div className="grid grid-cols-12 gap-2">
        <input
          className={`${inputClass} col-span-6 sm:col-span-2`}
          list="quote-codes"
          placeholder="Code"
          value={line.code ?? ""}
          onChange={(e) => onChange({ code: e.target.value })}
          aria-label="Code"
        />
        <input
          className={`${inputClass} col-span-6 sm:col-span-5`}
          placeholder="Description"
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          aria-label="Description"
        />
        <input
          className={`${inputClass} col-span-3 sm:col-span-1`}
          type="number"
          min={1}
          value={line.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) || 1 })}
          aria-label="Quantity"
          title="Qty"
        />
        <input
          className={`${inputClass} col-span-6 sm:col-span-3`}
          type="number"
          step="0.01"
          min={0}
          placeholder="Parts R"
          value={numVal(line.partsAmount)}
          onChange={(e) => onChange({ partsAmount: Number(e.target.value) || 0 })}
          aria-label="Parts amount"
        />
        <button
          type="button"
          onClick={onRemove}
          className="col-span-3 flex items-center justify-center text-coral sm:col-span-1"
          aria-label="Remove line"
        >
          ✕
        </button>
      </div>

      {/* Optional: prefill from parts catalogue */}
      {parts.length > 0 && (
        <select
          className={`${inputClass} mt-2 text-xs`}
          value={line.partId ?? ""}
          onChange={(e) => onPickPart(e.target.value)}
        >
          <option value="">— prefill parts from catalogue —</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.supplier}: {p.name} ({zar(p.price)})
            </option>
          ))}
        </select>
      )}

      {/* Work categories */}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <WorkBlock
          title="Panel beating"
          code={line.panelCode}
          amount={line.panelAmount}
          hours={line.panelHours}
          onChange={(p) =>
            onChange({ panelCode: p.code, panelAmount: p.amount, panelHours: p.hours })
          }
          className={cat}
        />
        <WorkBlock
          title="Paint"
          code={line.paintCode}
          amount={line.paintAmount}
          hours={line.paintHours}
          onChange={(p) =>
            onChange({ paintCode: p.code, paintAmount: p.amount, paintHours: p.hours })
          }
          className={cat}
        />
        <WorkBlock
          title="Strip & assemble"
          code={line.stripCode}
          amount={line.stripAmount}
          hours={line.stripHours}
          onChange={(p) =>
            onChange({ stripCode: p.code, stripAmount: p.amount, stripHours: p.hours })
          }
          className={cat}
        />
      </div>
    </div>
  );
}

function WorkBlock({
  title,
  code,
  amount,
  hours,
  onChange,
  className,
}: {
  title: string;
  code?: string;
  amount: number;
  hours: number;
  onChange: (p: { code?: string; amount: number; hours: number }) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/50">{title}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <input
          className={`${inputClass} px-2 py-1.5 text-sm`}
          placeholder="Code"
          value={code ?? ""}
          onChange={(e) => onChange({ code: e.target.value, amount, hours })}
          aria-label={`${title} code`}
        />
        <input
          className={`${inputClass} px-2 py-1.5 text-sm`}
          type="number"
          step="0.01"
          min={0}
          placeholder="R"
          value={numVal(amount)}
          onChange={(e) => onChange({ code, amount: Number(e.target.value) || 0, hours })}
          aria-label={`${title} amount`}
        />
        <input
          className={`${inputClass} px-2 py-1.5 text-sm`}
          type="number"
          step="0.5"
          min={0}
          placeholder="Hrs"
          value={numVal(hours)}
          onChange={(e) => onChange({ code, amount, hours: Number(e.target.value) || 0 })}
          aria-label={`${title} hours`}
        />
      </div>
    </div>
  );
}
