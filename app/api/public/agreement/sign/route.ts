import { NextResponse } from "next/server";
import {
  getRepairerAgreementByToken,
  signRepairerAgreement,
  getPanelBeater,
  setRepairerAgreementPdf,
} from "@/lib/store";
import { buildAgreementPdf } from "@/lib/agreementPdf";
import { uploadMedia } from "@/lib/blob";
import { sendSignedAgreementCopy } from "@/lib/email";
import { logActivity } from "@/lib/activityLog";

export const maxDuration = 60;

// PUBLIC (no auth): the repairer signs from the link we emailed them. The token
// is the credential — they have no portal login at the point this is sent.
export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    signerName?: string;
    signerTitle?: string;
    accepted?: boolean;
  };

  const token = body.token?.trim();
  const signerName = body.signerName?.trim();

  if (!token) return NextResponse.json({ error: "Missing link token" }, { status: 400 });
  if (!signerName)
    return NextResponse.json({ error: "Type your full name to sign" }, { status: 400 });
  if (!body.accepted)
    return NextResponse.json({ error: "Tick the box to accept the agreement" }, { status: 400 });

  const found = await getRepairerAgreementByToken(token);
  if (!found) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  if (found.agreement.signedAt)
    return NextResponse.json({ error: "This agreement is already signed" }, { status: 409 });

  // What we can observe about the act of signing. Not identity proof, but it's
  // what makes this an auditable electronic signature rather than a tick box.
  const signerIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const signerUserAgent = request.headers.get("user-agent") || undefined;

  const result = await signRepairerAgreement(token, {
    signerName,
    signerTitle: body.signerTitle?.trim() || undefined,
    signerIp,
    signerUserAgent,
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.reason === "already_signed" ? "Already signed" : "Agreement not found" },
      { status: result.reason === "already_signed" ? 409 : 404 }
    );

  // Someone signing a contract is worth a line of its own, even though the
  // signature itself is already recorded on the agreement — this is what puts
  // it on the same timeline as everything else that happened that day.
  await logActivity({
    action: "agreement.sign",
    summary: `${signerName} signed the repairer agreement for ${found.agreement.sentToName}`,
    entityType: "repairer_agreement",
    entityId: found.agreement.id,
    entityLabel: found.agreement.sentToName,
    // No login exists at this point — the token in their email is the credential.
    actorKind: "applicant",
    actorName: signerName,
    actorEmail: found.agreement.sentToEmail,
    panelBeaterId: found.agreement.panelBeaterId,
    detail: {
      signerTitle: body.signerTitle?.trim(),
      documentTitle: found.document.title,
    },
    request,
  });

  // The countersigned record. Best-effort: the signature is already recorded in
  // the database, so a PDF failure must not tell them it didn't work.
  const pb = await getPanelBeater(found.agreement.panelBeaterId);
  try {
    const signedAt = new Date();
    const pdf = await buildAgreementPdf({
      title: found.document.title,
      html: found.document.html,
      companyName: pb?.companyName ?? found.agreement.sentToName,
      companyRegNumber: pb?.companyRegNumber,
      vatNumber: pb?.vatNumber,
      signerName,
      signerTitle: body.signerTitle?.trim(),
      signerEmail: found.agreement.sentToEmail,
      signedAt,
      signerIp,
    });
    const { url } = await uploadMedia(
      `agreements/signed/${found.agreement.id}.pdf`,
      pdf,
      "application/pdf"
    );
    await setRepairerAgreementPdf(found.agreement.id, url);

    await sendSignedAgreementCopy({
      to: found.agreement.sentToEmail,
      signerName,
      companyName: pb?.tradingAs || pb?.companyName || found.agreement.sentToName,
      pdf,
    });
  } catch (err) {
    console.error("signed agreement pdf/email failed", err);
  }

  return NextResponse.json({ ok: true });
}
