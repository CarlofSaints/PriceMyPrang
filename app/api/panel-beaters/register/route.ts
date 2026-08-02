import { NextResponse } from "next/server";
import {
  getPanelBeaters,
  upsertPanelBeater,
  findUserByEmail,
  upsertUser,
  createEmailVerification,
  getActiveAgreementDocument,
  createRepairerAgreement,
} from "@/lib/store";
import { geocodeAddress } from "@/lib/geocode";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { PANEL_BEATER_ADMIN_ROLE } from "@/lib/permissions";
import { mergeWarranties } from "@/lib/warrantyReminders";
import {
  sendPanelBeaterRegistrationNotification,
  sendPanelBeaterWelcome,
  sendEmailVerification,
  sendRepairerAgreementInvite,
} from "@/lib/email";
import type { PanelBeater, User } from "@/lib/types";

// The workshop's first two logins are its admins — they need to be able to add
// the rest of their team (estimators, buyers) without coming through us.

/**
 * Give the applicant a way in. Both the person who filled the form in and the
 * business owner get their own login on the workshop — they're often different
 * people, and neither should have to share a password with the other. Same
 * address twice collapses to one account.
 *
 * An address that's already a user is SKIPPED, never overwritten: someone
 * re-registering (or an existing PMP user) must not have their password reset
 * by an unauthenticated endpoint.
 */
async function createLogins(pb: PanelBeater): Promise<{ created: string[]; skipped: string[] }> {
  const candidates = [
    { name: pb.completedByName, email: pb.completedByEmail },
    { name: pb.ownerName, email: pb.ownerEmail },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const email = c.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    if (await findUserByEmail(email)) {
      skipped.push(email);
      continue;
    }

    const password = generateTempPassword();
    const user: User = {
      id: crypto.randomUUID(),
      name: c.name?.trim() || pb.companyName,
      email,
      passwordHash: await hashPassword(password),
      role: PANEL_BEATER_ADMIN_ROLE,
      panelBeaterId: pb.id,
      active: true,
      // They chose nothing — this password was generated for them.
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    await upsertUser(user);
    created.push(email);

    // Best-effort: a failed email must not undo a good registration. The
    // account exists either way and an admin can resend from the Users page.
    try {
      await sendPanelBeaterWelcome({
        name: user.name,
        email,
        password,
        companyName: pb.tradingAs || pb.companyName,
      });
    } catch (err) {
      console.error("panel beater welcome email failed", email, err);
    }

    // Confirmation of the address itself, kept SEPARATE from the welcome. The
    // welcome carries a password, so anyone forwarding it hands over an
    // account; this one proves the address belongs to whoever typed it, which
    // is the only thing standing between the sign-up form and a stranger
    // registering a workshop under someone else's email.
    try {
      const token = await createEmailVerification(user.id, email);
      await sendEmailVerification(email, user.name, token);
    } catch (err) {
      // Non-fatal: they can ask for a fresh link from the portal.
      console.error("verification email failed", email, err);
    }
  }

  return { created, skipped };
}

/**
 * Send the repairer agreement for signing, as a separate email from the
 * welcome. Goes to whoever completed the form — they're the contact, and the
 * email tells them to forward it if they aren't the authorised signatory.
 */
async function sendAgreementInvite(pb: PanelBeater): Promise<boolean> {
  const doc = await getActiveAgreementDocument();
  if (!doc) return false;

  const email = pb.completedByEmail?.trim() || pb.ownerEmail?.trim();
  if (!email) return false;

  try {
    const agreement = await createRepairerAgreement({
      panelBeaterId: pb.id,
      documentId: doc.id,
      sentToName: pb.completedByName?.trim() || pb.companyName,
      sentToEmail: email,
    });
    const result = await sendRepairerAgreementInvite({
      name: agreement.sentToName,
      email,
      companyName: pb.tradingAs || pb.companyName,
      token: agreement.token,
    });
    return result.sent;
  } catch (err) {
    console.error("repairer agreement invite failed", err);
    return false;
  }
}

// PUBLIC (no auth): a panel beater applies to join. Created as pending +
// inactive so it does NOT appear on the consumer map until an admin approves.
export async function POST(request: Request) {
  const b = (await request.json()) as Partial<PanelBeater>;

  for (const req of [
    "completedByName",
    "completedByEmail",
    "ownerName",
    "ownerEmail",
    "companyName",
    "companyRegNumber",
    "physicalAddress",
    "rmiNumber",
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
    mibcoNumber: b.mibcoNumber?.trim() || undefined,
    rmiNumber: String(b.rmiNumber).trim(),
    sambraNumber: b.sambraNumber?.trim() || undefined,
    miwaNumber: b.miwaNumber?.trim() || undefined,
    labourRateSenior: b.labourRateSenior != null ? Number(b.labourRateSenior) : undefined,
    labourRateJunior: b.labourRateJunior != null ? Number(b.labourRateJunior) : undefined,
    logoUrl: b.logoUrl?.trim() || undefined,
    // The form no longer asks for a separate contact email — it's the workshop
    // address printed on quotes, so fall back to the owner (then whoever filled
    // the form in) rather than leaving quotes with no email on them.
    email: b.email?.trim() || b.ownerEmail?.trim() || b.completedByEmail?.trim() || undefined,
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

  // Logins first: the applicant is told to expect them, so a failure here is
  // worth surfacing, whereas the internal alert below is fire-and-forget.
  const logins = await createLogins(pb);

  // The agreement goes as its own email, to the person who filled the form in.
  // Skipped silently when no document has been uploaded yet — a registration
  // must not fail because we haven't published terms.
  const agreementSent = await sendAgreementInvite(pb);

  try {
    await sendPanelBeaterRegistrationNotification(pb);
  } catch (err) {
    console.error("registration email failed", err);
  }

  return NextResponse.json({
    ok: true,
    // So the form can tell them where the email went, and flag an address that
    // already had an account (they should sign in with their existing password).
    logins: logins.created,
    existingLogins: logins.skipped,
  });
}
