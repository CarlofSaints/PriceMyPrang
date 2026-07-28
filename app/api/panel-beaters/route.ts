import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters, upsertPanelBeater, upsertUser, findUserById, getPanelBeater } from "@/lib/store";
import { geocodeAddress } from "@/lib/geocode";
import { mergeWarranties } from "@/lib/warrantyReminders";
import type { PanelBeater } from "@/lib/types";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_panel_beaters") && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let list = await getPanelBeaters();
  // Panel-beater logins only see their own listing.
  if (!can(user, "manage_panel_beaters") && user.panelBeaterId) {
    list = list.filter((p) => p.id === user.panelBeaterId);
  }
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as Partial<PanelBeater> & { id?: string };

  for (const req of ["companyName", "companyRegNumber", "physicalAddress", "rmiNumber"] as const) {
    if (!b[req] || !String(b[req]).trim()) {
      return NextResponse.json({ error: `Missing required field: ${req}` }, { status: 400 });
    }
  }

  const existing = b.id ? (await getPanelBeaters()).find((p) => p.id === b.id) : null;

  // A self-onboarding user can only edit their own listing.
  if (!canManage && existing && existing.id !== user.panelBeaterId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Coordinates: prefer ones supplied by the "Get coordinates" button; else
  // (re)geocode when the address changed or coords are missing.
  let lat = existing?.lat;
  let lng = existing?.lng;
  if (typeof b.lat === "number" && typeof b.lng === "number") {
    lat = b.lat;
    lng = b.lng;
  } else if (!existing || existing.physicalAddress !== b.physicalAddress || lat == null) {
    const geo = await geocodeAddress(String(b.physicalAddress));
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  const pb: PanelBeater = {
    id: existing?.id ?? crypto.randomUUID(),
    completedByName: b.completedByName?.trim() || undefined,
    completedByEmail: b.completedByEmail?.trim() || undefined,
    ownerName: b.ownerName?.trim() || undefined,
    ownerEmail: b.ownerEmail?.trim() || undefined,
    warranties: mergeWarranties(b.warranties ?? [], existing?.warranties),
    companyName: String(b.companyName).trim(),
    tradingAs: b.tradingAs?.trim() || undefined,
    companyRegNumber: String(b.companyRegNumber).trim(),
    vatNumber: b.vatNumber?.trim() || undefined,
    physicalAddress: String(b.physicalAddress).trim(),
    lat,
    lng,
    mibcoNumber: b.mibcoNumber?.trim() || undefined,
    rmiNumber: String(b.rmiNumber).trim(),
    sambraNumber: b.sambraNumber?.trim() || undefined,
    miwaNumber: b.miwaNumber?.trim() || undefined,
    // The form no longer captures these (rates live on the Rates page), so an
    // edit posts nothing for them — keep whatever is already stored rather than
    // silently clearing it. Still honoured if a caller does send a value.
    labourRateSenior:
      b.labourRateSenior != null ? Number(b.labourRateSenior) : existing?.labourRateSenior,
    labourRateJunior:
      b.labourRateJunior != null ? Number(b.labourRateJunior) : existing?.labourRateJunior,
    logoUrl: b.logoUrl?.trim() || existing?.logoUrl,
    // See register/route.ts — no separate contact-email field on the form now,
    // so keep what's stored, else fall back to the owner / form completer.
    email:
      b.email?.trim() ||
      existing?.email ||
      b.ownerEmail?.trim() ||
      b.completedByEmail?.trim(),
    phone: b.phone?.trim() || existing?.phone,
    active: b.active ?? existing?.active ?? true,
    // Approval is decided on the Panel beaters page (PATCH), never by an edit.
    // writePanelBeater persists `status ?? "pending"` on update, so omitting
    // these would quietly un-approve a vetted workshop and put the "not yet
    // vetted" banner back in front of all its users.
    status: b.status ?? existing?.status ?? "pending",
    submittedByPublic: b.submittedByPublic ?? existing?.submittedByPublic,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  const missingCert = pb.warranties?.find((w) => !w.certificate);
  if (missingCert)
    return NextResponse.json(
      { error: `Upload a certificate for the ${missingCert.manufacturer} warranty.` },
      { status: 400 }
    );

  await upsertPanelBeater(pb);

  // Link a self-onboarding user to the listing they just created.
  if (!canManage && !user.panelBeaterId) {
    const fresh = await findUserById(user.id);
    if (fresh) {
      fresh.panelBeaterId = pb.id;
      await upsertUser(fresh);
    }
  }

  return NextResponse.json(pb);
}

// Approve / decline a (public) registration, or toggle active.
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_panel_beaters"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, active } = (await request.json()) as {
    id?: string;
    status?: "pending" | "approved" | "declined";
    active?: boolean;
  };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const pb = await getPanelBeater(id);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (status) {
    pb.status = status;
    // Approving makes it live on the map; declining hides it.
    if (status === "approved") pb.active = true;
    if (status === "declined") pb.active = false;
  }
  if (typeof active === "boolean") pb.active = active;

  await upsertPanelBeater(pb);
  return NextResponse.json(pb);
}
