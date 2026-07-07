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
  parts: QuoteLineItem[];
  seniorHours: number;
  juniorHours: number;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "build_quotes"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const p = (await request.json()) as Payload;
  const req = await getRequest(p.reference);
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const pb = await getPanelBeater(p.panelBeaterId);
  if (!pb) return NextResponse.json({ error: "Panel beater not found" }, { status: 404 });

  const parts = (p.parts || []).filter((x) => x.name?.trim());
  const seniorHours = Number(p.seniorHours) || 0;
  const juniorHours = Number(p.juniorHours) || 0;
  const rateSenior = pb.labourRateSenior || 0;
  const rateJunior = pb.labourRateJunior || 0;

  const partsTotal = parts.reduce((s, x) => s + (Number(x.unitPrice) || 0) * (Number(x.quantity) || 0), 0);
  const labourTotal = seniorHours * rateSenior + juniorHours * rateJunior;
  const subtotal = partsTotal + labourTotal;
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const quote: BuiltQuote = {
    id: crypto.randomUUID(),
    reference: req.reference,
    panelBeaterId: pb.id,
    parts: parts.map((x) => ({
      partId: x.partId,
      supplier: x.supplier,
      name: x.name,
      partNumber: x.partNumber,
      quantity: Number(x.quantity) || 1,
      unitPrice: Number(x.unitPrice) || 0,
    })),
    seniorHours,
    juniorHours,
    labourRateSenior: rateSenior,
    labourRateJunior: rateJunior,
    partsTotal,
    labourTotal,
    subtotal,
    vat,
    total,
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
