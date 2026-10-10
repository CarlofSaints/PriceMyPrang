import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDevTicketAttachments, removeDevTicketAttachment } from "@/lib/store";
import { deleteBlob } from "@/lib/blob";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import { parseJson } from "@/lib/validate";
import {
  AddDevTicketAttachmentsBody,
  DeleteDevTicketAttachmentBody,
} from "@/lib/schemas/devTickets";

// Attaching to a ticket that already exists. Files uploaded while COMPOSING a
// new ticket are sent with the POST in ../route.ts instead.
async function requireManage() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_dev_tickets"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const parsed = await parseJson(request, AddDevTicketAttachmentsBody, "POST /api/dev-tickets/attachments");
  if (parsed.response) return parsed.response;
  const b = parsed.data;
  if (!b.ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

  const files = (b.files ?? [])
    .filter((f) => f?.url && f?.pathname)
    .map((f) => ({
      fileName: (f.fileName || "attachment").slice(0, 200),
      url: f.url as string,
      pathname: f.pathname as string,
      contentType: f.contentType,
      size: typeof f.size === "number" ? f.size : undefined,
    }));

  if (!files.length) return NextResponse.json({ error: "No files supplied" }, { status: 400 });

  const ticket = await addDevTicketAttachments(b.ticketId, files);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  await logActivity({
    action: "dev_ticket.attach",
    summary: `${gate.user.name} attached ${files.length} file${files.length === 1 ? "" : "s"} to “${ticket.title}”`,
    entityType: "dev_ticket",
    entityId: ticket.id,
    entityLabel: ticket.title,
    ...actorFromUser(gate.user),
    detail: { files: files.map((f) => ({ fileName: f.fileName, size: f.size, contentType: f.contentType })) },
    request,
  });

  return NextResponse.json(ticket);
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const parsed = await parseJson(request, DeleteDevTicketAttachmentBody, "DELETE /api/dev-tickets/attachments");
  if (parsed.response) return parsed.response;
  const { attachmentId } = parsed.data;
  if (!attachmentId)
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 });

  const removed = await removeDevTicketAttachment(attachmentId);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteBlob(removed.pathname);

  await logActivity({
    action: "dev_ticket.attachment_delete",
    summary: `${gate.user.name} removed the attachment ${removed.fileName}`,
    entityType: "dev_ticket_attachment",
    entityId: removed.id,
    entityLabel: removed.fileName,
    ...actorFromUser(gate.user),
    request,
  });

  return NextResponse.json({ ok: true });
}
