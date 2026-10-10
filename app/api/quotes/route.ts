import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getRequest,
  upsertQuote,
  getPanelBeater,
  getRateCard,
  listSuppliersForPanelBeater,
} from "@/lib/store";
import { uploadMedia } from "@/lib/blob";
import { buildQuotePdf } from "@/lib/quotePdf";
import { sendConsumerQuoteReady } from "@/lib/email";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { BuiltQuote, QuoteLineItem } from "@/lib/types";
import { parseJson } from "@/lib/validate";
import { BuildQuoteBody } from "@/lib/schemas/quotes";
import { computeQuoteTotals, type SundriesMode } from "@/lib/quoteTotals";
import { priceLines, type CardRates } from "@/lib/quotePricing";

export const maxDuration = 60;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const canBuild = can(user, "build_quotes");
  if (!canBuild && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJson(request, BuildQuoteBody, "POST /api/quotes");
  if (parsed.response) return parsed.response;
  const p = parsed.data;
  const req = await getRequest(p.reference);
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const pb = await getPanelBeater(p.panelBeaterId);
  if (!pb) return NextResponse.json({ error: "Panel beater not found" }, { status: 404 });

  // A panel-beater login may only build a quote for their OWN listing on a
  // request assigned to them.
  if (!canBuild) {
    const ownsBoth =
      !!user.panelBeaterId &&
      p.panelBeaterId === user.panelBeaterId &&
      req.selectedPanelBeaterIds.includes(user.panelBeaterId);
    if (!ownsBoth) {
      // A workshop reaching for a job that isn't theirs is exactly the kind of
      // thing this log exists to surface.
      await logActivity({
        action: "quote.build",
        summary: `${user.name} was refused a quote on ${req.reference} for a workshop that isn't theirs`,
        outcome: "denied",
        status: 403,
        entityType: "request",
        entityId: req.reference,
        entityLabel: req.reference,
        ...actorFromUser(user),
        detail: { requestedPanelBeaterId: p.panelBeaterId },
        request,
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // The rate card is looked up HERE, by id, and must be this workshop's own:
  // a card id is only a pointer, and another repairer's (or an insurer's
  // better) rates are not this quote's to borrow. No card = typed by hand.
  let rates: CardRates | undefined;
  const scope = p.scope ?? "out_of_warranty";
  if (p.rateCardId) {
    const card = await getRateCard(p.rateCardId);
    if (!card || card.panelBeaterId !== pb.id)
      return NextResponse.json({ error: "That rate card isn't this workshop's" }, { status: 400 });
    if (scope === "aluminium" && !card.aluminium)
      return NextResponse.json({ error: "That rate card has no aluminium rates" }, { status: 400 });
    rates = card.values[scope] ?? {};
  }

  // Keep lines that carry a description or any value. Lines are priced off
  // the card before the filter, so a line is judged by what it will charge.
  const lines: QuoteLineItem[] = priceLines(
    (p.lines || []).map((x) => ({
      code: x.code?.trim() || undefined,
      description: (x.description || "").trim(),
      quantity: Math.max(1, num(x.quantity) || 1),
      // Cost is what the workshop paid; kept so a quote can be audited against
      // the mark-up its rate card allows. Only the charge feeds the totals.
      partsCost: x.partsCost == null ? undefined : num(x.partsCost),
      partsAmount: num(x.partsAmount),
      partId: x.partId ?? undefined,
      supplierId: x.supplierId ?? undefined,
      supplier: x.supplier ?? undefined,
      partNumber: x.partNumber ?? undefined,
      panelCode: x.panelCode?.trim() || undefined,
      panelAmount: num(x.panelAmount),
      panelHours: num(x.panelHours),
      paintCode: x.paintCode?.trim() || undefined,
      paintAmount: num(x.paintAmount),
      paintHours: num(x.paintHours),
      stripCode: x.stripCode?.trim() || undefined,
      stripAmount: num(x.stripAmount),
      stripHours: num(x.stripHours),
    })),
    rates
  ).filter(
    (x) => x.description || x.partsAmount || x.panelAmount || x.paintAmount || x.stripAmount
  );

  // A supplier id arrives from the browser, so it is checked against the
  // quoting workshop's OWN book before it is stored. Otherwise a posted id
  // could link a line to another repairer's supplier: a quiet cross-tenant
  // reference sitting in a table Power BI reads. An unrecognised id is dropped
  // rather than rejected: the NAME is kept either way, so provenance survives
  // and the estimator isn't blocked mid-quote by a bad id they can't see.
  const ownSuppliers = new Set((await listSuppliersForPanelBeater(pb.id)).map((s) => s.id));
  for (const l of lines) {
    if (l.supplierId && !ownSuppliers.has(l.supplierId)) l.supplierId = undefined;
  }

  // Totals come from lib/quoteTotals so the number on screen and the number in
  // the PDF are produced by the same code, not two copies of it.
  const sundriesMode: SundriesMode = p.sundriesMode === "percent" ? "percent" : "rand";
  const t = computeQuoteTotals({
    lines,
    sundriesMode,
    sundriesValue: num(p.sundries),
    consumables: num(p.consumables),
  });
  const {
    partsTotal,
    outWorkTotal,
    panelTotal,
    paintTotal,
    stripTotal,
    labourTotal,
    totalHours,
    sundries,
    consumables,
    subtotal,
    vat,
    total,
  } = t;

  const quote: BuiltQuote = {
    id: crypto.randomUUID(),
    reference: req.reference,
    panelBeaterId: pb.id,
    // A freshly built quote is with the consumer. upsertQuote deliberately
    // leaves the stored status alone on a rebuild, so re-pricing a job that's
    // already been accepted doesn't quietly un-accept it.
    status: "awaiting_approval",
    lines,
    sundries,
    sundriesPercent: sundriesMode === "percent" ? num(p.sundries) : undefined,
    consumables,
    partsTotal,
    outWorkTotal,
    panelTotal,
    paintTotal,
    stripTotal,
    labourTotal,
    totalHours,
    subtotal,
    vat,
    total,
    notes: p.notes?.trim() || undefined,
    estimatorName: user.name,
    createdAt: new Date().toISOString(),
    createdByName: user.name,
  };

  // Render the PDF and store it.
  try {
    const buffer = await buildQuotePdf(quote, req, pb);
    const safeName = (pb.tradingAs || pb.companyName).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const { url } = await uploadMedia(
      `quotes/${req.reference}/${req.reference}-${safeName}.pdf`,
      buffer,
      "application/pdf"
    );
    quote.pdfUrl = url;
  } catch (err) {
    console.error("PDF generation failed", err);
    // A failed build leaves nothing behind anywhere else, so without this line
    // the estimator's "it wouldn't save" has no evidence at all.
    await logActivity({
      action: "quote.build",
      summary: `${user.name}'s quote on ${req.reference} failed to render as a PDF`,
      outcome: "failed",
      status: 500,
      entityType: "request",
      entityId: req.reference,
      entityLabel: req.reference,
      ...actorFromUser(user),
      panelBeaterId: pb.id,
      detail: { error: err instanceof Error ? err.message : String(err), lines: lines.length },
      request,
    });
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Inserts, or replaces this workshop's existing quote, and moves the
  // request's status on once every requested quote is in.
  await upsertQuote(req.reference, quote);

  // Let the consumer know there's something to look at. Best-effort: the quote
  // is saved either way, and they can still reach it from an earlier link.
  // Skipped for repairer-initiated jobs, where the workshop handles the client.
  let quoteReadyEmail: "sent" | "failed" | "skipped" = "skipped";
  if (!req.repairerInitiated) {
    try {
      await sendConsumerQuoteReady(req, pb, quote.total);
      quoteReadyEmail = "sent";
    } catch (err) {
      console.error("quote-ready email failed", err);
      quoteReadyEmail = "failed";
    }
  }

  const label = pb.tradingAs || pb.companyName;
  await logActivity({
    action: "quote.build",
    summary: `${user.name} priced ${req.reference} for ${label} at R${quote.total.toFixed(2)}`,
    entityType: "request",
    entityId: req.reference,
    entityLabel: req.reference,
    ...actorFromUser(user),
    // The workshop the quote is FOR: staff quoting on someone's behalf have no
    // panelBeaterId of their own, and this is the number a report groups by.
    panelBeaterId: pb.id,
    detail: {
      panelBeater: label,
      rateCardId: p.rateCardId || null,
      scope: rates ? scope : null,
      lines: lines.length,
      totalHours,
      partsTotal,
      outWorkTotal,
      labourTotal,
      sundries,
      sundriesMode,
      consumables,
      subtotal,
      vat,
      total,
      quoteReadyEmail,
    },
    request,
  });

  return NextResponse.json(quote);
}
