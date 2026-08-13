import { NextResponse } from "next/server";
import {
  getPanelBeaters,
  upsertPanelBeater,
  findUserByEmail,
  upsertUser,
  createPasswordSetToken,
  getActiveAgreementDocument,
  createRepairerAgreement,
} from "@/lib/store";
import { geocodeAddress } from "@/lib/geocode";
import { generateTempPassword, hashPassword } from "@/lib/auth";
import { PANEL_BEATER_ADMIN_ROLE } from "@/lib/permissions";
import { mergeWarranties } from "@/lib/warrantyReminders";
import { logActivity } from "@/lib/activityLog";
import {
  sendPanelBeaterRegistrationNotification,
  sendPanelBeaterWelcome,
  passwordSetUrl,
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
 *
 * NO PASSWORD IS EVER PUT IN THE EMAIL. Each account is created with a random
 * one nobody will ever see, and the welcome carries a one-time link to choose
 * their own. Mac-Rites (12 Aug 2026) registered two people and neither received
 * anything, because their Microsoft 365 filter treats a message containing a
 * password as high-confidence spam.
 *
 * The separate "confirm your address" email is GONE, deliberately: the link is
 * now the only way into a new account, and opening one that was emailed to that
 * inbox proves the address just as well — so redeeming it marks the address
 * verified (see redeemPasswordSetToken). Sending a second link to prove the
 * first link arrived is one more message to be quarantined for no gain.
 */
interface LoginOutcome {
  email: string;
  name: string;
  sent: boolean;
  error?: string;
}

async function createLogins(
  pb: PanelBeater,
  request: Request
): Promise<{ created: string[]; skipped: string[]; mail: LoginOutcome[] }> {
  const candidates = [
    { name: pb.completedByName, email: pb.completedByEmail },
    { name: pb.ownerName, email: pb.ownerEmail },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  const mail: LoginOutcome[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const email = c.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);

    if (await findUserByEmail(email)) {
      skipped.push(email);
      continue;
    }

    const user: User = {
      id: crypto.randomUUID(),
      name: c.name?.trim() || pb.companyName,
      email,
      // A placeholder nobody knows, including us. The set-password link is the
      // only way in, and it replaces this.
      passwordHash: await hashPassword(generateTempPassword(32)),
      role: PANEL_BEATER_ADMIN_ROLE,
      panelBeaterId: pb.id,
      active: true,
      // Kept true so that if an admin ever hands them a temporary password
      // instead, the change-password gate still applies.
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    await upsertUser(user);
    created.push(email);

    // Best-effort: a failed email must not undo a good registration. The
    // account exists either way and an admin can resend from the Users page.
    //
    // But it is no longer SILENT. This used to be swallowed to console.error,
    // so when a whole workshop said "we never got anything" there was no row
    // anywhere saying whether we had even tried.
    let outcome: LoginOutcome = { email, name: user.name, sent: false };
    try {
      const token = await createPasswordSetToken(user.id, email, "welcome");
      const result = await sendPanelBeaterWelcome({
        name: user.name,
        email,
        setPasswordUrl: passwordSetUrl(token),
        companyName: pb.tradingAs || pb.companyName,
      });
      outcome = { email, name: user.name, sent: result.sent, error: result.error };
    } catch (err) {
      outcome = { email, name: user.name, sent: false, error: (err as Error).message };
    }
    mail.push(outcome);

    await logActivity({
      action: "user.welcome.send",
      summary: outcome.sent
        ? `Welcome email sent to ${outcome.name} (${email})`
        : `Welcome email to ${outcome.name} (${email}) DID NOT SEND${
            outcome.error ? `: ${outcome.error}` : ""
          }`,
      outcome: outcome.sent ? "success" : "failed",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      // Nobody is signed in — the workshop is registering itself.
      actorKind: "applicant",
      actorName: user.name,
      actorEmail: email,
      panelBeaterId: pb.id,
      // The link is a credential. Whether it went, never where it points.
      detail: { email, welcomeEmailed: outcome.sent, welcomeEmailError: outcome.error },
      request,
    });
  }

  return { created, skipped, mail };
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
  const logins = await createLogins(pb, request);

  // The agreement goes as its own email, to the person who filled the form in.
  // Skipped silently when no document has been uploaded yet — a registration
  // must not fail because we haven't published terms.
  const agreementSent = await sendAgreementInvite(pb);

  try {
    await sendPanelBeaterRegistrationNotification(pb);
  } catch (err) {
    console.error("registration email failed", err);
  }

  await logActivity({
    action: "panel_beater.register",
    summary: `${pb.tradingAs || pb.companyName} applied to join the panel`,
    entityType: "panel_beater",
    entityId: pb.id,
    entityLabel: pb.tradingAs || pb.companyName,
    // No login exists yet — this is the form that creates the first ones.
    actorKind: "applicant",
    actorName: pb.completedByName || pb.ownerName,
    actorEmail: pb.completedByEmail || pb.ownerEmail,
    panelBeaterId: pb.id,
    detail: {
      companyName: pb.companyName,
      tradingAs: pb.tradingAs,
      companyRegNumber: pb.companyRegNumber,
      physicalAddress: pb.physicalAddress,
      geocoded: pb.lat != null && pb.lng != null,
      warranties: pb.warranties?.length ?? 0,
      // WHICH addresses got a login, never the links that went with them.
      loginsCreated: logins.created,
      loginsSkipped: logins.skipped,
      // The per-address detail is on the user.welcome.send rows; this is the
      // headline, so "did anyone actually hear from us" is answerable from the
      // registration line alone.
      welcomeEmailsSent: logins.mail.filter((m) => m.sent).length,
      welcomeEmailsFailed: logins.mail.filter((m) => !m.sent).map((m) => m.email),
      agreementEmailed: agreementSent,
    },
    request,
  });

  return NextResponse.json({
    ok: true,
    // So the form can tell them where the email went, and flag an address that
    // already had an account (they should sign in with their existing password).
    logins: logins.created,
    existingLogins: logins.skipped,
  });
}
