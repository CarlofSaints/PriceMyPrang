import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDevTicketAttachments, removeDevTicketAttachment } from "@/lib/store";
import { deleteBlob } from "@/lib/blob";

// Attaching to a ticket that already exists. Files uploaded while COMPOSING a
// new ticket are sent with the POST in ../route.ts instead.
async function requireManage() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_dev_tickets"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

type IncomingFile = {
  fileName?: string;
  url?: string;
  pathname?: string;
  contentType?: string;
  size?: number;
};

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as { ticketId?: string; files?: IncomingFile[] };
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
  return NextResponse.json(ticket);
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const { attachmentId } = (await request.json()) as { attachmentId?: string };
  if (!attachmentId)
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 });

  const removed = await removeDevTicketAttachment(attachmentId);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteBlob(removed.pathname);
  return NextResponse.json({ ok: true });
}
