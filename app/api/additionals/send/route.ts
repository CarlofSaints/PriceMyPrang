import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getAdditional,
  getRequest,
  getPanelBeater,
  findInsurerContact,
  markAdditionalSent,
} from "@/lib/store";
import { actingWorkshop } from "@/lib/additionalsAccess";
import { sendAdditionalsToInsurer, sendAdditionalsToClient } from "@/lib/email";

/**
 * Send an additionals request to the insurer, and tell the client.
 *
 * Split from the save on purpose. Saving is a draft the estimator can rework;
 * this is the irreversible bit — once the insurer has a set of numbers, the
 * request locks and anything further has to be a new one.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_additionals"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    id?: string;
    panelBeaterId?: string;
    /** A saved contact to send to. */
    contactId?: string;
    /** Or a one-off address typed for this claim. */
    email?: string;
    /** Whether to also tell the client. Defaults ON. */
    notifyClient?: boolean;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const workshop = actingWorkshop(user, b.panelBeaterId);
  if (!workshop) return NextResponse.json({ error: "Choose a workshop." }, { status: 400 });

  const additional = await getAdditional(b.id);
  // Another workshop's request is a 404, not a 403.
  if (!additional || additional.panelBeaterId !== workshop)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (additional.sentAt)
    return NextResponse.json(
      { error: "This has already been sent to the insurer." },
      { status: 409 }
    );

  if (!additional.lines.length)
    return NextResponse.json({ error: "There is nothing to send." }, { status: 400 });

  // Work out who the insurer copy goes to.
  let to = b.email?.trim().toLowerCase();
  let contactName: string | undefined;
  let contactId: string | undefined;

  if (b.contactId) {
    const contact = await findInsurerContact(b.contactId);
    // A contact must be either generic or this workshop's own — otherwise a
    // guessed id would let one workshop read another's private address by
    // watching where the mail went.
    if (!contact || (contact.panelBeaterId && contact.panelBeaterId !== workshop))
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (!contact.email)
      return NextResponse.json(
        { error: "That contact has no email address on it." },
        { status: 400 }
      );
    to = contact.email;
    contactName = contact.name;
    contactId = contact.id;
  }

  if (!to)
    return NextResponse.json(
      { error: "Choose a contact at the insurer, or type an address." },
      { status: 400 }
    );

  const req = additional.reference ? await getRequest(additional.reference) : null;
  if (!req) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const pb = await getPanelBeater(workshop);

  const insurerResult = await sendAdditionalsToInsurer({
    additional,
    request: req,
    panelBeater: pb,
    to,
    contactName,
  });

  // The client copy is secondary: the insurer is who unblocks the repair. If
  // theirs failed there is nothing to tell the client about yet, so don't.
  const notifyClient = b.notifyClient !== false;
  const clientResult =
    insurerResult.sent && notifyClient
      ? await sendAdditionalsToClient({
          additional,
          request: req,
          panelBeater: pb,
          insurerName: req.insurerName,
        })
      : { sent: false, error: undefined as string | undefined };

  await markAdditionalSent(additional.id, {
    contactId,
    sentToEmail: to,
    sentToName: contactName,
    insurerSent: insurerResult.sent,
    clientEmail: req.email,
    clientSent: clientResult.sent,
  });

  if (!insurerResult.sent)
    return NextResponse.json(
      {
        error: `Couldn't send it to the insurer${
          insurerResult.error ? ` (${insurerResult.error})` : ""
        }. Nothing has been marked as sent — try again.`,
      },
      { status: 502 }
    );

  return NextResponse.json({
    ok: true,
    additional: await getAdditional(additional.id),
    insurerSent: true,
    sentTo: to,
    clientSent: clientResult.sent,
    clientError: notifyClient && !clientResult.sent ? clientResult.error : undefined,
  });
}
