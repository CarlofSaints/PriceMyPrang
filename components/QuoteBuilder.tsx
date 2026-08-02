"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BuiltQuote,
  PanelBeater,
  QuoteLineItem,
  QuoteRequest,
  RateCard,
  Supplier,
} from "@/lib/types";
import { GENERAL_FIELDS, SCOPED_FIELDS, type RateScope } from "@/lib/rateCard";
import { QUOTE_LINE_CODES } from "@/lib/types";
import { computeQuoteTotals, type SundriesMode } from "@/lib/quoteTotals";
import { Button, Field, inputClass } from "./ui";
import { zar } from "@/lib/format";

type Line = QuoteLineItem;

/**
 * Which mark-up on the rate card applies to a line, by its part-type code.
 * Anything else (Repair, Out Work, Paint, Note) isn't a part, so nothing is
 * marked up.
 */
const MARKUP_FIELD_BY_CODE: Record<string, string> = {
  New: "markup_oem",
  Alt: "markup_alternate",
  Used: "markup_used",
};

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Active quote form
  const [pbId, setPbId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [sundries, setSundries] = useState(0);
  // Jerome asked for sundries as a percentage; Carl wanted BOTH, so the box
  // holds either and this says which. A % is taken on PARTS only.
  const [sundriesMode, setSundriesMode] = useState<SundriesMode>("rand");
  const [consumables, setConsumables] = useState(0);
  const [notes, setNotes] = useState("");
  const [building, setBuilding] = useState(false);

  // The workshop's own supplier book, for sourcing New / Used / Alternate
  // parts. Fetched for the workshop the quote is FOR — not the same as the
  // signed-in user's workshop when PMP staff quote on a repairer's behalf.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Rates the quote is priced on: which of the workshop's cards, and which
  // block of it. Labour and paint amounts are then hours x rate rather than
  // typed from memory.
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [rateCardId, setRateCardId] = useState<string>("");
  const [scope, setScope] = useState<RateScope>("out_of_warranty");

  const rateCard = rateCards.find((c) => c.id === rateCardId) ?? null;
  const rates = rateCard?.values[scope] ?? {};
  const labourRate = rates.labour_rate;
  const paintRate = rates.paint_rate;

  // Load an existing quote for a workshop into the form, else start blank.
  const loadFormFor = useCallback((req: QuoteRequest, id: string) => {
    const existing = req.quotes.find((q) => q.panelBeaterId === id);
    if (existing) {
      setLines(existing.lines.length ? existing.lines.map((l) => ({ ...l })) : [{ ...emptyLine }]);
      // Reopen showing the percentage the estimator actually typed, not the
      // rand value it happened to resolve to.
      if (existing.sundriesPercent != null) {
        setSundriesMode("percent");
        setSundries(existing.sundriesPercent);
      } else {
        setSundriesMode("rand");
        setSundries(existing.sundries || 0);
      }
      setConsumables(existing.consumables || 0);
      setNotes(existing.notes || "");
    } else {
      setLines([{ ...emptyLine }]);
      setSundries(0);
      setConsumables(0);
      setNotes("");
    }
  }, []);

  /**
   * Pull the chosen workshop's rate cards. Rates are per workshop AND per
   * insurer, so they can only be fetched once we know who is quoting — a
   * different workshop on the same job prices it differently.
   */
  const loadRateCards = useCallback(async (id: string, req: QuoteRequest | null) => {
    if (!id) {
      setRateCards([]);
      setRateCardId("");
      return;
    }
    try {
      const res = await fetch(`/api/rate-cards?panelBeaterId=${encodeURIComponent(id)}`);
      const cards: RateCard[] = res.ok ? await res.json() : [];
      setRateCards(cards);
      // Prefer the card the job was opened against; else the cash card.
      const preferred =
        cards.find((c) => c.id === req?.rateCardId) ??
        cards.find((c) => c.kind === "cash") ??
        cards[0];
      setRateCardId(preferred?.id ?? "");
    } catch {
      setRateCards([]);
      setRateCardId("");
    }
  }, []);

  const loadSuppliers = useCallback(async (id: string) => {
    if (!id) return setSuppliers([]);
    try {
      const res = await fetch(`/api/my-suppliers?panelBeaterId=${encodeURIComponent(id)}`);
      const data = res.ok ? await res.json() : { suppliers: [] };
      setSuppliers(data.suppliers ?? []);
    } catch {
      setSuppliers([]);
    }
  }, []);

  const load = useCallback(
    async (reference: string) => {
      setError(null);
      setLoading(true);
      setRequest(null);
      try {
        const [rReq, rPb] = await Promise.all([
          fetch(`/api/requests/${encodeURIComponent(reference.trim())}`),
          fetch("/api/panel-beaters"),
        ]);
        if (!rReq.ok) throw new Error("Request not found — check the reference.");
        const req = (await rReq.json()) as QuoteRequest;
        setRequest(req);
        setPanelBeaters(rPb.ok ? await rPb.json() : []);
        // Preselect the first not-yet-quoted workshop.
        const quotedIds = new Set(req.quotes.map((q) => q.panelBeaterId));
        const next = req.selectedPanelBeaterIds.find((id) => !quotedIds.has(id));
        const chosen = next ?? req.selectedPanelBeaterIds[0] ?? "";
        setPbId(chosen);
        loadFormFor(req, chosen);
        // The consumer's warranty answer decides which block applies; they're
        // only asked yes/no/unsure, and "unsure" is safest treated as out.
        setScope(req.underWarranty === "yes" ? "in_warranty" : "out_of_warranty");
        await loadRateCards(chosen, req);
        await loadSuppliers(chosen);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadFormFor, loadRateCards, loadSuppliers]
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
    loadRateCards(id, request);
    loadSuppliers(id);
  }

  /**
   * Apply a patch, then re-price the part if we have both a cost and a mark-up
   * for its type. Re-runs when the CODE changes too, since switching New → Used
   * changes which percentage applies. A patch that sets partsAmount directly is
   * left alone — that's the estimator overriding the calculation.
   */
  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, ...patch };
        if (patch.partsAmount !== undefined) return next;

        const field = MARKUP_FIELD_BY_CODE[next.code ?? ""];
        const markup = field ? rates[field] : undefined;
        if (next.partsCost != null && markup != null) {
          next.partsAmount = Number((next.partsCost * (1 + markup / 100)).toFixed(2));
        } else if (next.partsCost != null && patch.partsCost !== undefined) {
          // No mark-up configured for this type — charge it on at cost.
          next.partsAmount = next.partsCost;
        }
        return next;
      })
    );
  }

  // Live totals — same module the server uses, so the screen and the PDF can
  // never disagree about what a quote comes to.
  const {
    partsTotal,
    outWorkTotal,
    panelTotal,
    paintTotal,
    stripTotal,
    sundries: sundriesAmount,
    subtotal,
    vat,
    total,
  } = computeQuoteTotals({
    lines,
    sundriesMode,
    sundriesValue: Number(sundries) || 0,
    consumables: Number(consumables) || 0,
  });

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
          sundriesMode,
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

            {/* Which rates this quote is priced on. */}
            <div className="rounded-xl border border-teal/20 bg-offwhite/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Rate card">
                  <select
                    className={inputClass}
                    value={rateCardId}
                    onChange={(e) => setRateCardId(e.target.value)}
                    disabled={rateCards.length === 0}
                  >
                    <option value="">
                      {rateCards.length ? "Type amounts manually" : "No rate cards set up"}
                    </option>
                    {rateCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.kind === "cash" ? "Cash rates" : `${c.insurerName || "Insurer"} rates`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Which rates apply">
                  <select
                    className={inputClass}
                    value={scope}
                    onChange={(e) => setScope(e.target.value as RateScope)}
                    disabled={!rateCard}
                  >
                    <option value="in_warranty">In warranty</option>
                    <option value="out_of_warranty">Out of warranty</option>
                    {rateCard?.aluminium && <option value="aluminium">Aluminium</option>}
                  </select>
                </Field>
              </div>

              {rateCard ? (
                <p className="mt-3 text-sm text-ink/70">
                  Labour{" "}
                  <strong>{labourRate != null ? `${zar(labourRate)}/hr` : "not set"}</strong> ·
                  Paint <strong>{paintRate != null ? `${zar(paintRate)}/hr` : "not set"}</strong>
                  {" · "}Parts mark-up OEM{" "}
                  <strong>{rates.markup_oem != null ? `${rates.markup_oem}%` : "—"}</strong> · Alt{" "}
                  <strong>
                    {rates.markup_alternate != null ? `${rates.markup_alternate}%` : "—"}
                  </strong>{" "}
                  · Used{" "}
                  <strong>{rates.markup_used != null ? `${rates.markup_used}%` : "—"}</strong>
                  <span className="block text-xs text-ink/50">
                    Enter hours and a parts cost below; amounts are worked out for you. Type over
                    any amount to override it.
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-xs text-ink/50">
                  {rateCards.length
                    ? "No card selected — amounts are typed in by hand."
                    : "This workshop hasn't set up any rate cards on the Rates page yet."}
                </p>
              )}

              {/* Fixed-price rates off the card, added as a line in one click. */}
              {rateCard && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...SCOPED_FIELDS, ...GENERAL_FIELDS]
                    .filter((f) => f.unit === "rand")
                    .map((f) => {
                      const value =
                        rateCard.values[scope]?.[f.key] ?? rateCard.values.general?.[f.key];
                      if (value == null) return null;
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() =>
                            setLines((ls) => [
                              ...ls,
                              { ...emptyLine, description: f.label, partsAmount: value },
                            ])
                          }
                          className="rounded-full border border-teal/30 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-teal/5"
                        >
                          + {f.label} ({zar(value)})
                        </button>
                      );
                    })}
                </div>
              )}
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
                  labourRate={labourRate}
                  paintRate={paintRate}
                  suppliers={suppliers}
                  panelBeaterId={pbId}
                  onSupplierAdded={(s) => setSuppliers((l) => [...l, s])}
                  onChange={(patch) => updateLine(i, patch)}
                  onRemove={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                />
              ))}
              <Button variant="outline" size="md" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>
                + Add line
              </Button>
            </div>

            {/* Sundries / consumables / notes */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Sundries"
                required
                hint={
                  sundriesMode === "percent"
                    ? `Percentage of parts (${zar(partsTotal)}) — currently ${zar(sundriesAmount)}.`
                    : "A flat rand amount. Switch to % to charge a share of parts instead."
                }
              >
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    type="number"
                    step="0.01"
                    min={0}
                    value={numVal(sundries)}
                    onChange={(e) => setSundries(Number(e.target.value) || 0)}
                    aria-label={sundriesMode === "percent" ? "Sundries percent" : "Sundries rand"}
                  />
                  {/* One box, two meanings — the toggle says which, and the
                      hint above shows what a % works out to in rands. */}
                  <select
                    className={`${inputClass} w-20`}
                    value={sundriesMode}
                    onChange={(e) => setSundriesMode(e.target.value as SundriesMode)}
                    aria-label="Sundries as rand or percent"
                  >
                    <option value="rand">R</option>
                    <option value="percent">%</option>
                  </select>
                </div>
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
              {outWorkTotal > 0 && <TotalRow label="Out work" value={outWorkTotal} />}
              <TotalRow label="Panel beating" value={panelTotal} />
              <TotalRow label="Paint" value={paintTotal} />
              <TotalRow label="Strip & assemble" value={stripTotal} />
              <TotalRow label="Sundries" value={sundriesAmount} />
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

/** Codes that mean the line IS a part, and therefore came from somewhere. */
const SOURCED_CODES = new Set(["New", "Alt", "Used"]);

function LineCard({
  line,
  labourRate,
  paintRate,
  suppliers,
  panelBeaterId,
  onSupplierAdded,
  onChange,
  onRemove,
}: {
  line: Line;
  /** From the chosen rate card. Undefined = no card, so amounts stay manual. */
  labourRate?: number;
  paintRate?: number;
  suppliers: Supplier[];
  panelBeaterId: string;
  onSupplierAdded: (s: Supplier) => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const cat = "rounded-xl border border-teal/15 bg-offwhite/40 p-3";

  const needsSupplier = SOURCED_CODES.has((line.code ?? "").trim());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  /**
   * Add a supplier without leaving the quote. Jerome's point: the estimator is
   * mid-job when they discover the supplier isn't on the list, and sending them
   * to another page to add it is how "where did this part come from" ends up
   * blank.
   */
  async function addSupplier() {
    const name = newName.trim();
    if (!name) return;
    setSavingSupplier(true);
    setSupplierError(null);
    try {
      const res = await fetch("/api/my-suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, panelBeaterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add the supplier");
      onSupplierAdded(data as Supplier);
      // Select what they just created — that was the point of adding it.
      onChange({ supplierId: data.id, supplier: data.name });
      setAdding(false);
      setNewName("");
    } catch (err) {
      setSupplierError((err as Error).message);
    } finally {
      setSavingSupplier(false);
    }
  }
  return (
    <div className="rounded-2xl border border-teal/15 bg-white p-3">
      {/* Column labels. Placeholders disappear the moment a field is filled,
          which left the estimator guessing which box was which — QTY in
          particular read as an unexplained "1". */}
      <div className="mb-1 hidden grid-cols-12 gap-2 px-1 sm:grid">
        <span className="col-span-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Code
        </span>
        <span className="col-span-4 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Description
        </span>
        <span className="col-span-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Qty
        </span>
        <span className="col-span-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Cost
        </span>
        <span className="col-span-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
          Charge
        </span>
      </div>

      {/* Line basics */}
      <div className="grid grid-cols-12 gap-2">
        <input
          className={`${inputClass} col-span-6 sm:col-span-2`}
          list="quote-codes"
          placeholder="Code"
          // Free text with suggestions, capped so a code stays a code and
          // doesn't run into the description column on the printed quote.
          maxLength={8}
          value={line.code ?? ""}
          onChange={(e) => onChange({ code: e.target.value })}
          aria-label="Code"
        />
        <input
          className={`${inputClass} col-span-6 sm:col-span-4`}
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
          className={`${inputClass} col-span-3 sm:col-span-2`}
          type="number"
          step="0.01"
          min={0}
          placeholder="Cost R"
          value={numVal(line.partsCost ?? 0)}
          onChange={(e) =>
            onChange({
              partsCost: e.target.value === "" ? undefined : Number(e.target.value) || 0,
            })
          }
          aria-label="Parts cost"
          title="What the part cost you, before mark-up"
        />
        <input
          className={`${inputClass} col-span-3 sm:col-span-2`}
          type="number"
          step="0.01"
          min={0}
          placeholder="Charge R"
          value={numVal(line.partsAmount)}
          onChange={(e) => onChange({ partsAmount: Number(e.target.value) || 0 })}
          aria-label="Parts charge"
          title="What the client is charged. Worked out from cost + mark-up, but you can override it."
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

      {/* Where the part came from. Only for New / Alt / Used — a Repair or a
          Note wasn't bought from anyone.

          BACK OFFICE ONLY: this never reaches the customer's quote. It is here
          because the workshop needs to know where a part was sourced after the
          estimator who ordered it has moved on. */}
      {needsSupplier && (
        <div className="mt-2 rounded-xl border border-teal/15 bg-offwhite/40 p-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink/50">
            Sourced from{" "}
            <span className="font-normal normal-case tracking-normal text-ink/40">
              — not shown on the customer&apos;s quote
            </span>
          </p>

          {adding ? (
            <div className="space-y-2">
              <input
                className={`${inputClass} text-sm`}
                placeholder="Supplier company name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="md" disabled={savingSupplier} onClick={addSupplier}>
                  {savingSupplier ? "Adding…" : "Add and use"}
                </Button>
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                    setSupplierError(null);
                  }}
                >
                  Cancel
                </Button>
                <span className="text-xs text-ink/45">
                  Add the rest of their details later on the Suppliers page.
                </span>
              </div>
              {supplierError && <p className="text-xs text-coral">{supplierError}</p>}
            </div>
          ) : (
            <select
              className={`${inputClass} text-sm`}
              value={line.supplierId ?? ""}
              onChange={(e) => {
                if (e.target.value === "__add") return setAdding(true);
                const s = suppliers.find((x) => x.id === e.target.value);
                // Store the NAME alongside the id, so provenance survives the
                // supplier later being removed from the book.
                onChange({ supplierId: s?.id, supplier: s?.name });
              }}
              aria-label="Supplier"
            >
              <option value="">— choose a supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__add">+ Add a supplier…</option>
            </select>
          )}

          {/* A quote built before this existed, or one whose supplier has since
              been removed, still knows the name. Say so rather than silently
              showing an empty picker. */}
          {!adding && !line.supplierId && line.supplier && (
            <p className="mt-1 text-xs text-ink/50">
              Previously recorded as <strong>{line.supplier}</strong>.
            </p>
          )}
        </div>
      )}

      {/* Work categories */}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {/* Panel beating and strip & assemble are labour; paint has its own
            rate. Where a rate is set, typing hours fills the amount. */}
        <WorkBlock
          title="Panel beating"
          code={line.panelCode}
          amount={line.panelAmount}
          hours={line.panelHours}
          rate={labourRate}
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
          rate={paintRate}
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
          rate={labourRate}
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
  rate,
  onChange,
  className,
}: {
  title: string;
  code?: string;
  amount: number;
  hours: number;
  /** Hourly rate off the card. Undefined leaves the amount entirely manual. */
  rate?: number;
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
          onChange={(e) => {
            const nextAmount = Number(e.target.value) || 0;
            // The mirror of the hours box: with a rate on the card, typing a
            // rand value back-solves the hours. An estimator quoting "that's
            // about R1 250 of panel work" gets the hours filled in for them,
            // which is what the labour total on the printed quote is built on.
            onChange({
              code,
              amount: nextAmount,
              hours: rate ? Number((nextAmount / rate).toFixed(2)) : hours,
            });
          }}
          aria-label={`${title} amount`}
        />
        <input
          className={`${inputClass} px-2 py-1.5 text-sm`}
          type="number"
          step="0.5"
          min={0}
          placeholder="Hrs"
          value={numVal(hours)}
          onChange={(e) => {
            const nextHours = Number(e.target.value) || 0;
            // With a rate on the card, hours drive the amount. The amount box
            // stays editable, so an estimator can still override a line.
            onChange({
              code,
              hours: nextHours,
              amount: rate != null ? Number((nextHours * rate).toFixed(2)) : amount,
            });
          }}
          aria-label={`${title} hours`}
        />
      </div>
      {rate != null && (
        <p className="mt-1 text-[10px] text-ink/40">at {zar(rate)}/hr</p>
      )}
    </div>
  );
}
