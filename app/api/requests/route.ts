import { NextResponse } from "next/server";
import { getPanelBeaters, saveRequest } from "@/lib/store";
import { nextReference } from "@/lib/reference";
import { sendConsumerConfirmation, sendAdminNotification } from "@/lib/email";
import type { MediaRef, QuoteRequest, RequiredPhotos, VehicleDetails } from "@/lib/types";

interface Payload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  hasInsurance: "yes" | "no";
  insurerName?: string;
  underWarranty: "yes" | "no" | "unsure";
  isInsuranceClaim: "yes" | "no";
  claimNumber?: string;
  noClaimNumberYet?: boolean;
  isThirdPartyClaim: "yes" | "no";
  suspectedEngineDamage: "yes" | "no";
  quotesRequested: number;
  vehicle: VehicleDetails;
  discImage?: MediaRef | null;
  video?: MediaRef | null;
  requiredPhotos?: RequiredPhotos;
  damagePhotos: MediaRef[];
  location?: { lat: number; lng: number } | null;
  letUsChoose?: boolean;
  selectedPanelBeaterIds: string[];
}

export async function POST(request: Request) {
  const p = (await request.json()) as Payload;

  if (!p.firstName || !p.lastName || !p.email || !p.phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const letUsChoose = !!p.letUsChoose;
  if (!letUsChoose && !p.selectedPanelBeaterIds?.length) {
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
    phone: p.phone.trim(),
    companyName: p.companyName?.trim() || undefined,
    hasInsurance: p.hasInsurance,
    insurerName: p.hasInsurance === "yes" ? p.insurerName?.trim() || undefined : undefined,
    underWarranty: p.underWarranty,
    isInsuranceClaim: p.isInsuranceClaim,
    claimNumber:
      p.isInsuranceClaim === "yes" && !p.noClaimNumberYet
        ? p.claimNumber?.trim() || undefined
        : undefined,
    noClaimNumberYet: p.isInsuranceClaim === "yes" ? !!p.noClaimNumberYet : undefined,
    isThirdPartyClaim: p.isThirdPartyClaim,
    suspectedEngineDamage: p.suspectedEngineDamage,
    quotesRequested: Math.min(20, Math.max(1, Number(p.quotesRequested) || 1)),
    vehicle: p.vehicle || {},
    discImage: p.discImage || undefined,
    video: p.video || undefined,
    requiredPhotos: p.requiredPhotos || {},
    damagePhotos: p.damagePhotos || [],
    location: p.location || undefined,
    letUsChoose,
    selectedPanelBeaterIds: letUsChoose ? [] : p.selectedPanelBeaterIds,
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
