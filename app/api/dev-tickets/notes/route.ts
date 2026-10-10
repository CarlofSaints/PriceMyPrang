import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDevTicketNote, deleteDevTicketNote } from "@/lib/store";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import { parseJson } from "@/lib/validate";
import { AddDevTicketNoteBody, DeleteDevTicketNoteBody } from "@/lib/schemas/devTickets";

// The running conversation on a ticket. Same Super-Admin-only gate as the
// ticket itself: notes are internal and must never widen who can read a
// ticket's contents.
async function requireManage() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_dev_tickets"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/** Long enough for a real handover note, short enough not to be a document. */
const MAX_NOTE = 5000;

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const parsed = await parseJson(request, AddDevTicketNoteBody, "POST /api/dev-tickets/notes");
  if (parsed.response) return parsed.response;
  const b = parsed.data;
  if (!b.ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return NextResponse.json({ error: "The note is empty" }, { status: 400 });

  // Author comes from the SESSION, never the body: otherwise a note could be
  // made to look like somebody else wrote it.
  const ticket = await addDevTicketNote(b.ticketId, {
    body: body.slice(0, MAX_NOTE),
    createdById: gate.user.id,
    createdByName: gate.user.name,
    createdByEmail: gate.user.email,
  });

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  await logActivity({
    action: "dev_ticket.note",
    summary: `${gate.user.name} added a note to “${ticket.title}”`,
    entityType: "dev_ticket",
    entityId: ticket.id,
    entityLabel: ticket.title,
    ...actorFromUser(gate.user),
    detail: { chars: body.length },
    request,
  });

  return NextResponse.json(ticket);
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const parsed = await parseJson(request, DeleteDevTicketNoteBody, "DELETE /api/dev-tickets/notes");
  if (parsed.response) return parsed.response;
  const { noteId } = parsed.data;
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  const ticket = await deleteDevTicketNote(noteId);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    action: "dev_ticket.note_delete",
    summary: `${gate.user.name} deleted a note from “${ticket.title}”`,
    entityType: "dev_ticket",
    entityId: ticket.id,
    entityLabel: ticket.title,
    ...actorFromUser(gate.user),
    request,
  });

  return NextResponse.json(ticket);
}
