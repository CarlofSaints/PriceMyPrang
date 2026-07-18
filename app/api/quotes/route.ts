import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRequest, saveRequest, getPanelBeater } from "@/lib/store";
import { uploadMedia } from "@/lib/blob";
import { buildQuotePdf } from "@/lib/quotePdf";
import type { BuiltQuote, QuoteLineItem } from "@/lib/types";

export const maxDuration = 60;

interface Payload {
  reference: string;
  panelBeaterId: string;
  lines: QuoteLineItem[];
  sundries?: number;
  consumables?: number;
  notes?: string;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (!ownsBoth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Keep lines that carry a description or any value.
  const lines: QuoteLineItem[] = (p.lines || [])
    .map((x) => ({
      code: x.code?.trim() || undefined,
      description: (x.description || "").trim(),
      quantity: Math.max(1, num(x.quantity) || 1),
      partsAmount: num(x.partsAmount),
      partId: x.partId,
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

  const sundries = num(p.sundries);
  const consumables = num(p.consumables);

  const partsTotal = lines.reduce((s, x) => s + x.partsAmount, 0);
  const panelTotal = lines.reduce((s, x) => s + x.panelAmount, 0);
  const paintTotal = lines.reduce((s, x) => s + x.paintAmount, 0);
  const stripTotal = lines.reduce((s, x) => s + x.stripAmount, 0);
  const labourTotal = panelTotal + paintTotal + stripTotal;
  const totalHours = lines.reduce((s, x) => s + x.panelHours + x.paintHours + x.stripHours, 0);

  const subtotal = partsTotal + labourTotal + sundries + consumables;
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const quote: BuiltQuote = {
    id: crypto.randomUUID(),
    reference: req.reference,
    panelBeaterId: pb.id,
    lines,
    sundries,
    consumables,
    partsTotal,
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
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Replace any existing quote for this panel beater, else append.
  const idx = req.quotes.findIndex((q) => q.panelBeaterId === pb.id);
  if (idx >= 0) req.quotes[idx] = quote;
  else req.quotes.push(quote);

  req.status = req.quotes.length >= req.quotesRequested ? "completed" : "in_progress";
  await saveRequest(req);

  return NextResponse.json(quote);
}
