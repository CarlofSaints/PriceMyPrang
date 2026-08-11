import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getRequest,
  upsertQuote,
  getPanelBeater,
  listSuppliersForPanelBeater,
} from "@/lib/store";
import { uploadMedia } from "@/lib/blob";
import { buildQuotePdf } from "@/lib/quotePdf";
import { sendConsumerQuoteReady } from "@/lib/email";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { BuiltQuote, QuoteLineItem } from "@/lib/types";
import { computeQuoteTotals, type SundriesMode } from "@/lib/quoteTotals";

export const maxDuration = 60;

interface Payload {
  reference: string;
  panelBeaterId: string;
  lines: QuoteLineItem[];
  /** A rand amount, or a percentage of parts when sundriesMode is "percent". */
  sundries?: number;
  sundriesMode?: "rand" | "percent";
  consumables?: number;
  notes?: string;
}

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

  const p = (await request.json()) as Payload;
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

  // Keep lines that carry a description or any value.
  const lines: QuoteLineItem[] = (p.lines || [])
    .map((x) => ({
      code: x.code?.trim() || undefined,
      description: (x.description || "").trim(),
      quantity: Math.max(1, num(x.quantity) || 1),
      // Cost is what the workshop paid; kept so a quote can be audited against
      // the mark-up its rate card allows. Only the charge feeds the totals.
      partsCost: x.partsCost == null ? undefined : num(x.partsCost),
      partsAmount: num(x.partsAmount),
      partId: x.partId,
      supplierId: x.supplierId,
      supplier: x.supplier,
      partNumber: x.partNumber,
      panelCode: x.panelCode?.trim() || undefined,
      panelAmount: num(x.panelAmount),
      panelHours: num(x.panelHours),
      paintCode: x.paintCode?.trim() || undefined,
      paintAmount: num(x.paintAmount),
      paintHours: num(x.paintHours),
      stripCode: x.stripCode?.trim() || undefined,
      stripAmount: num(x.stripAmount),
      stripHours: num(x.stripHours),
    }))
    .filter(
      (x) =>
        x.description ||
        x.partsAmount ||
        x.panelAmount ||
        x.paintAmount ||
        x.stripAmount
    );

  // A supplier id arrives from the browser, so it is checked against the
  // quoting workshop's OWN book before it is stored. Otherwise a posted id
  // could link a line to another repairer's supplier — a quiet cross-tenant
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

  // Let the consumer know there's something to look at. Best-effort — the quote
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
    // The workshop the quote is FOR — staff quoting on someone's behalf have no
    // panelBeaterId of their own, and this is the number a report groups by.
    panelBeaterId: pb.id,
    detail: {
      panelBeater: label,
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
