import { NextResponse } from "next/server";
import { requireUser, getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters, createRequest, findRequestIdByReference } from "@/lib/store";
import { ozowConfig } from "@/lib/ozow";
import { startPayment, siteUrlFor } from "@/lib/payments";
import {
  sendConsumerConfirmation,
  sendAdminNotification,
  sendUnknownInsurerNotification,
} from "@/lib/email";
import { logActivity, actorFromUser, consumerActor } from "@/lib/activityLog";
import { geocodeAddress } from "@/lib/geocode";
import { nearestKm } from "@/lib/geo";
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
  vehicle: VehicleDetails;
  mileageKm?: number | string;
  odometerImage?: MediaRef | null;
  discImage?: MediaRef | null;
  video?: MediaRef | null;
  requiredPhotos?: RequiredPhotos;
  damagePhotos: MediaRef[];
  /** Town or suburb the vehicle is in. Consumer submissions only. */
  town?: string;
  /** Province the vehicle is in. Consumer submissions only. */
  province?: string;
  selectedPanelBeaterIds?: string[];
  /** True when a logged-in panel beater is quoting a walk-in themselves. */
  repairerQuote?: boolean;
  /** Rate type off the repairer's own rate card. Repairer-initiated jobs only. */
  rateCardId?: string;
}

export async function POST(request: Request) {
  const p = (await request.json()) as Payload;

  if (!p.firstName || !p.lastName || !p.email || !p.phone) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const repairerQuote = !!p.repairerQuote;
  let letUsChoose = false;
  let selectedPanelBeaterIds: string[] = [];
  // How many quotes we expect. A repairer self-quoting means exactly one; for a
  // consumer it stays 0 until we assign workshops, because from 2 Sep 2026 the
  // consumer does not choose and nobody has decided yet.
  let quotesRequested = 0;

  if (repairerQuote) {
    // Panel beater self-quoting a walk-in. Must be logged in and linked to a
    // listing (or a manager who supplies a target workshop). Assigned to them.
    const { user, response } = await requireUser();
    if (response) return response;
    // Managers and quote-builders may quote for any workshop (chosen in the form);
    // a panel-beater login may only quote for their own listing.
    const canChooseAny = can(user, "manage_panel_beaters") || can(user, "build_quotes");
    if (!canChooseAny && !can(user, "onboard_self"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const targetId = user.panelBeaterId || (canChooseAny ? p.selectedPanelBeaterIds?.[0] : undefined);
    if (!targetId)
      return NextResponse.json(
        {
          error: canChooseAny
            ? "Please choose which workshop this quote is for."
            : "Link your login to a panel beater listing to create your own quotes.",
        },
        { status: 400 }
      );
    // Self-service users may only quote for their own listing.
    if (!canChooseAny && targetId !== user.panelBeaterId)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    selectedPanelBeaterIds = [targetId];
    quotesRequested = 1;
  } else {
    // Consumer submission. There is no workshop choice to make any more: we
    // match the job to a repairer ourselves, in the portal.
    if (!p.town?.trim() || !p.province?.trim()) {
      return NextResponse.json(
        { error: "Please tell us the town and province the vehicle is in." },
        { status: 400 }
      );
    }
    letUsChoose = true;
    selectedPanelBeaterIds = [];
  }

  // Geocode the town so a distance can be measured, and so the map we removed
  // can come back later without asking anybody for their address again. Both
  // this and the coverage figure are best effort: a Google outage must never
  // cost us the submission itself.
  let location: { lat: number; lng: number } | null = null;
  let nearestPanelBeaterKm: number | null = null;
  if (!repairerQuote && p.town && p.province) {
    try {
      location = await geocodeAddress(`${p.town.trim()}, ${p.province.trim()}, South Africa`);
      const active = (await getPanelBeaters()).filter((pb) => pb.active);
      nearestPanelBeaterKm = nearestKm(location, active);
    } catch (err) {
      console.error("request location lookup failed", err);
    }
  }

  const draft: Omit<QuoteRequest, "reference"> = {
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
    // Only meaningful when a repairer opened the job off their own rate card.
    rateCardId: repairerQuote ? p.rateCardId?.trim() || undefined : undefined,
    town: p.town?.trim() || undefined,
    province: p.province?.trim() || undefined,
    location: location || undefined,
    nearestPanelBeaterKm: nearestPanelBeaterKm ?? undefined,
    letUsChoose,
    selectedPanelBeaterIds,
    quotes: [],
  };

  const req = await createRequest(draft);

  // A repairer-initiated job is somebody at a workshop filling the form in; a
  // consumer submission has no login behind it at all. Both are real activity
  // and both belong in the log, so the actor is whichever one applies.
  const actingUser = repairerQuote ? await getCurrentUser() : null;
  await logActivity({
    action: repairerQuote ? "request.repairer_create" : "request.create",
    summary: repairerQuote
      ? `${actingUser?.name ?? "A repairer"} opened job ${req.reference} for ${req.firstName} ${req.lastName}`
      : `${req.firstName} ${req.lastName} submitted quote request ${req.reference}`,
    entityType: "request",
    entityId: req.reference,
    entityLabel: req.reference,
    ...(actingUser
      ? actorFromUser(actingUser)
      : consumerActor(`${req.firstName} ${req.lastName}`, req.email)),
    panelBeaterId: repairerQuote ? selectedPanelBeaterIds[0] : undefined,
    detail: {
      reference: req.reference,
      quotesRequested,
      letUsChoose,
      workshopsChosen: selectedPanelBeaterIds.length,
      town: req.town,
      province: req.province,
      geocoded: !!location,
      nearestPanelBeaterKm,
      vehicle: [req.vehicle?.make, req.vehicle?.model, req.vehicle?.year]
        .filter(Boolean)
        .join(" "),
      hasInsurance: req.hasInsurance,
      insurer: req.insurerName,
      insurerListed: !!req.insurerId,
      isInsuranceClaim: req.isInsuranceClaim,
      underWarranty: req.underWarranty,
      mileageKm: req.mileageKm,
      damagePhotos: req.damagePhotos?.length ?? 0,
      hasVideo: !!req.video,
      hasDisc: !!req.discImage,
      hasOdometer: !!req.odometerImage,
    },
    request,
  });

  // With Ozow switched on, a consumer request is not work until it is paid:
  // nobody is emailed now, lib/payments.ts does that the moment Ozow confirms.
  // The customer goes straight to Ozow. If Ozow won't open a payment, the
  // request is still saved and the pay page lets them try again.
  if (!repairerQuote && ozowConfig()) {
    const id = await findRequestIdByReference(req.reference);
    let payUrl: string | null = null;
    try {
      const started = id ? await startPayment(id, siteUrlFor(request)) : null;
      if (started?.kind === "redirect") payUrl = started.url;
    } catch (err) {
      // Already logged as payment.start_failed with Ozow's reason.
      console.error("ozow start failed", err);
    }
    return NextResponse.json({
      reference: req.reference,
      nearestPanelBeaterKm,
      payUrl,
      payPage: req.publicToken ? `/pay/${req.publicToken}` : null,
    });
  }

  // Consumer/admin notification emails only apply to consumer-submitted requests.
  // A repairer self-quote is handled by the repairer, so we don't email anyone.
  if (!repairerQuote) {
    const all = await getPanelBeaters();
    const chosen = all.filter((pb) => req.selectedPanelBeaterIds.includes(pb.id));
    // An insurer name with no insurerId means they picked "Other" and typed it.
    // Worth telling the admins so the dropdown can grow.
    const unknownInsurer = !!req.insurerName && !req.insurerId;

    // Emails are best-effort: never fail the submission on an email error.
    try {
      await Promise.allSettled([
        sendConsumerConfirmation(req, chosen),
        sendAdminNotification(req, chosen),
        ...(unknownInsurer ? [sendUnknownInsurerNotification(req)] : []),
      ]);
    } catch (err) {
      console.error("email send failed", err);
    }
  }

  // nearestPanelBeaterKm goes back so the confirmation screen can be honest
  // about coverage. Null means we could not tell, which the screen treats as
  // "say nothing", never as "nobody is near".
  return NextResponse.json({
    reference: req.reference,
    nearestPanelBeaterKm,
  });
}
