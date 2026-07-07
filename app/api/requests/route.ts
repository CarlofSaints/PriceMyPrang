import { NextResponse } from "next/server";
import { getPanelBeaters, saveRequest } from "@/lib/store";
import { nextReference } from "@/lib/reference";
import { sendConsumerConfirmation, sendAdminNotification } from "@/lib/email";
import type { MediaRef, QuoteRequest, VehicleDetails } from "@/lib/types";

interface Payload {
  firstName: string;
  lastName: string;
  email: string;
  hasInsurance: "yes" | "no";
  underWarranty: "yes" | "no" | "unsure";
  isInsuranceClaim: "yes" | "no";
  isThirdPartyClaim: "yes" | "no";
  suspectedEngineDamage: "yes" | "no";
  quotesRequested: number;
  vehicle: VehicleDetails;
  discImage?: MediaRef | null;
  video?: MediaRef | null;
  damagePhotos: MediaRef[];
  location?: { lat: number; lng: number } | null;
  selectedPanelBeaterIds: string[];
}

export async function POST(request: Request) {
  const p = (await request.json()) as Payload;

  if (!p.firstName || !p.lastName || !p.email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!p.selectedPanelBeaterIds?.length) {
    return NextResponse.json({ error: "No panel beaters selected" }, { status: 400 });
  }

  const reference = await nextReference(p.lastName);

  const req: QuoteRequest = {
    reference,
    createdAt: new Date().toISOString(),
    status: "new",
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    email: p.email.trim(),
    hasInsurance: p.hasInsurance,
    underWarranty: p.underWarranty,
    isInsuranceClaim: p.isInsuranceClaim,
    isThirdPartyClaim: p.isThirdPartyClaim,
    suspectedEngineDamage: p.suspectedEngineDamage,
    quotesRequested: Math.min(4, Math.max(1, Number(p.quotesRequested) || 1)),
    vehicle: p.vehicle || {},
    discImage: p.discImage || undefined,
    video: p.video || undefined,
    damagePhotos: p.damagePhotos || [],
    location: p.location || undefined,
    selectedPanelBeaterIds: p.selectedPanelBeaterIds,
    quotes: [],
  };

  await saveRequest(req);

  // Look up the chosen workshops for the emails.
  const all = await getPanelBeaters();
  const chosen = all.filter((pb) => req.selectedPanelBeaterIds.includes(pb.id));

  // Emails are best-effort — never fail the submission on an email error.
  try {
    await Promise.allSettled([
      sendConsumerConfirmation(req, chosen),
      sendAdminNotification(req, chosen),
    ]);
  } catch (err) {
    console.error("email send failed", err);
  }

  return NextResponse.json({ reference });
}
