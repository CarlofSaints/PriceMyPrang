import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
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
  insurerId?: string;
  underWarranty: "yes" | "no" | "unsure";
  isInsuranceClaim: "yes" | "no";
  claimNumber?: string;
  noClaimNumberYet?: boolean;
  isThirdPartyClaim: "yes" | "no";
  suspectedEngineDamage: "yes" | "no";
  quotesRequested: number;
  vehicle: VehicleDetails;
  mileageKm?: number | string;
  odometerImage?: MediaRef | null;
  discImage?: MediaRef | null;
  video?: MediaRef | null;
  requiredPhotos?: RequiredPhotos;
  damagePhotos: MediaRef[];
  location?: { lat: number; lng: number } | null;
  letUsChoose?: boolean;
  selectedPanelBeaterIds?: string[];
  /** True when a logged-in panel beater is quoting a walk-in themselves. */
  repairerQuote?: boolean;
}

export async function POST(request: Request) {
  const p = (await request.json()) as Payload;

  if (!p.firstName || !p.lastName || !p.email || !p.phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const repairerQuote = !!p.repairerQuote;
  let letUsChoose = false;
  let selectedPanelBeaterIds: string[] = [];
  let quotesRequested = Math.min(20, Math.max(1, Number(p.quotesRequested) || 1));

  if (repairerQuote) {
    // Panel beater self-quoting a walk-in. Must be logged in and linked to a
    // listing (or a manager who supplies a target workshop). Assigned to them.
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const canManage = can(user, "manage_panel_beaters");
    if (!canManage && !can(user, "onboard_self") && !can(user, "build_quotes"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const targetId = user.panelBeaterId || (canManage ? p.selectedPanelBeaterIds?.[0] : undefined);
    if (!targetId)
      return NextResponse.json(
        { error: "Link your login to a panel beater listing to create your own quotes." },
        { status: 400 }
      );
    // Self-service users may only quote for their own listing.
    if (!canManage && targetId !== user.panelBeaterId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    selectedPanelBeaterIds = [targetId];
    quotesRequested = 1;
  } else {
    letUsChoose = !!p.letUsChoose;
    if (!letUsChoose && !p.selectedPanelBeaterIds?.length) {
      return NextResponse.json({ error: "No panel beaters selected" }, { status: 400 });
    }
    selectedPanelBeaterIds = letUsChoose ? [] : p.selectedPanelBeaterIds ?? [];
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
    insurerId: p.hasInsurance === "yes" ? p.insurerId?.trim() || undefined : undefined,
    underWarranty: p.underWarranty,
    isInsuranceClaim: p.isInsuranceClaim,
    claimNumber:
      p.isInsuranceClaim === "yes" && !p.noClaimNumberYet
        ? p.claimNumber?.trim() || undefined
        : undefined,
    noClaimNumberYet: p.isInsuranceClaim === "yes" ? !!p.noClaimNumberYet : undefined,
    isThirdPartyClaim: p.isThirdPartyClaim,
    suspectedEngineDamage: p.suspectedEngineDamage,
    quotesRequested,
    vehicle: p.vehicle || {},
    mileageKm: Number(p.mileageKm) > 0 ? Math.round(Number(p.mileageKm)) : undefined,
    odometerImage: p.odometerImage || undefined,
    discImage: p.discImage || undefined,
    video: p.video || undefined,
    requiredPhotos: p.requiredPhotos || {},
    damagePhotos: p.damagePhotos || [],
    repairerInitiated: repairerQuote || undefined,
    location: p.location || undefined,
    letUsChoose,
    selectedPanelBeaterIds,
    quotes: [],
  };

  await saveRequest(req);

  // Consumer/admin notification emails only apply to consumer-submitted requests.
  // A repairer self-quote is handled by the repairer, so we don't email anyone.
  if (!repairerQuote) {
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
  }

  return NextResponse.json({ reference });
}
