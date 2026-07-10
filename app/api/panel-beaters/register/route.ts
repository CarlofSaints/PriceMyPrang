import { NextResponse } from "next/server";
import { getPanelBeaters, upsertPanelBeater } from "@/lib/store";
import { geocodeAddress } from "@/lib/geocode";
import { mergeWarranties } from "@/lib/warrantyReminders";
import { sendPanelBeaterRegistrationNotification } from "@/lib/email";
import type { PanelBeater } from "@/lib/types";

// PUBLIC (no auth): a panel beater applies to join. Created as pending +
// inactive so it does NOT appear on the consumer map until an admin approves.
export async function POST(request: Request) {
  const b = (await request.json()) as Partial<PanelBeater>;

  for (const req of [
    "companyName",
    "companyRegNumber",
    "physicalAddress",
    "mibcoNumber",
    "rmiNumber",
    "sambraNumber",
  ] as const) {
    if (!b[req] || !String(b[req]).trim()) {
      return NextResponse.json({ error: `Missing required field: ${req}` }, { status: 400 });
    }
  }

  const geo = await geocodeAddress(String(b.physicalAddress));

  const pb: PanelBeater = {
    id: crypto.randomUUID(),
    completedByName: b.completedByName?.trim() || undefined,
    completedByEmail: b.completedByEmail?.trim() || undefined,
    ownerName: b.ownerName?.trim() || undefined,
    ownerEmail: b.ownerEmail?.trim() || undefined,
    warranties: mergeWarranties(b.warranties ?? []),
    companyName: String(b.companyName).trim(),
    tradingAs: b.tradingAs?.trim() || undefined,
    companyRegNumber: String(b.companyRegNumber).trim(),
    vatNumber: b.vatNumber?.trim() || undefined,
    physicalAddress: String(b.physicalAddress).trim(),
    lat: geo?.lat,
    lng: geo?.lng,
    mibcoNumber: String(b.mibcoNumber).trim(),
    rmiNumber: String(b.rmiNumber).trim(),
    sambraNumber: String(b.sambraNumber).trim(),
    miwaNumber: b.miwaNumber?.trim() || undefined,
    labourRateSenior: b.labourRateSenior != null ? Number(b.labourRateSenior) : undefined,
    labourRateJunior: b.labourRateJunior != null ? Number(b.labourRateJunior) : undefined,
    logoUrl: b.logoUrl?.trim() || undefined,
    email: b.email?.trim() || undefined,
    phone: b.phone?.trim() || undefined,
    active: false,
    status: "pending",
    submittedByPublic: true,
    createdAt: new Date().toISOString(),
  };

  const missingCert = pb.warranties?.find((w) => !w.certificate);
  if (missingCert)
    return NextResponse.json(
      { error: `Upload a certificate for the ${missingCert.manufacturer} warranty.` },
      { status: 400 }
    );

  // Guard against obvious duplicate spam (same reg number already pending/active).
  const existing = await getPanelBeaters();
  if (existing.some((p) => p.companyRegNumber === pb.companyRegNumber)) {
    return NextResponse.json(
      { error: "A panel beater with this company registration number already exists." },
      { status: 409 }
    );
  }

  await upsertPanelBeater(pb);

  try {
    await sendPanelBeaterRegistrationNotification(pb);
  } catch (err) {
    console.error("registration email failed", err);
  }

  return NextResponse.json({ ok: true });
}
