import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listDevTickets,
  getDevTicketStats,
  createDevTicket,
  updateDevTicket,
  deleteDevTicket,
} from "@/lib/store";
import { deleteBlob } from "@/lib/blob";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import {
  DEV_PRIORITIES,
  DEV_TICKET_STATUSES,
  type DevPriority,
  type DevTicketStatus,
} from "@/lib/types";

// The dev planner is PMP's own backlog — Super Admin only. Every handler goes
// through requireManage, so there is no route here a panel beater can reach.
async function requireManage() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_dev_tickets"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

const priorityOf = (v: unknown): DevPriority | undefined =>
  DEV_PRIORITIES.includes(v as DevPriority) ? (v as DevPriority) : undefined;

const statusOf = (v: unknown): DevTicketStatus | undefined =>
  DEV_TICKET_STATUSES.includes(v as DevTicketStatus) ? (v as DevTicketStatus) : undefined;

/** "yyyy-mm-dd" or nothing. Anything else is treated as no date rather than NaN. */
function dateOf(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return Number.isNaN(Date.parse(v)) ? undefined : v;
}

type IncomingFile = {
  fileName?: string;
  url?: string;
  pathname?: string;
  contentType?: string;
  size?: number;
};

/** Only files that actually landed in Blob (url + pathname) become rows. */
function cleanFiles(input: unknown) {
  if (!Array.isArray(input)) return [];
  return (input as IncomingFile[])
    .filter((f) => f?.url && f?.pathname)
    .map((f) => ({
      fileName: (f.fileName || "attachment").slice(0, 200),
      url: f.url as string,
      pathname: f.pathname as string,
      contentType: f.contentType,
      size: typeof f.size === "number" ? f.size : undefined,
    }));
}

export async function GET(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(request.url);
  const [tickets, stats] = await Promise.all([
    listDevTickets({
      status: statusOf(searchParams.get("status")),
      priority: priorityOf(searchParams.get("priority")),
      search: searchParams.get("q")?.trim() || undefined,
    }),
    getDevTicketStats(),
  ]);

  return NextResponse.json({ tickets, stats });
}

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  // Author and timestamp come from the SESSION, never the body — otherwise a
  // ticket could claim to have been logged by someone else.
  const ticket = await createDevTicket({
    title,
    detail: typeof b.detail === "string" ? b.detail.trim() || undefined : undefined,
    priority: priorityOf(b.priority) ?? "must_do",
    status: statusOf(b.status) ?? "backlog",
    remindOn: dateOf(b.remindOn),
    createdById: gate.user.id,
    createdByName: gate.user.name,
    createdByEmail: gate.user.email,
    attachments: cleanFiles(b.attachments),
  });

  await logActivity({
    action: "dev_ticket.create",
    summary: `${gate.user.name} logged the ticket “${ticket.title}” (${ticket.priority})`,
    entityType: "dev_ticket",
    entityId: ticket.id,
    entityLabel: ticket.title,
    ...actorFromUser(gate.user),
    detail: {
      priority: ticket.priority,
      status: ticket.status,
      remindOn: ticket.remindOn,
      attachments: ticket.attachments.length,
    },
    request,
  });

  return NextResponse.json(ticket);
}

export async function PATCH(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (b.title !== undefined && !String(b.title).trim())
    return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const ticket = await updateDevTicket(id, {
    title: b.title !== undefined ? String(b.title).trim() : undefined,
    detail: b.detail !== undefined ? String(b.detail ?? "").trim() : undefined,
    priority: priorityOf(b.priority),
    status: statusOf(b.status),
    // null clears the date; undefined leaves it alone.
    remindOn: b.remindOn === undefined ? undefined : dateOf(b.remindOn) ?? null,
  });

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Status is the field people actually watch move, so it leads the summary.
  await logActivity({
    action: "dev_ticket.update",
    summary: `${gate.user.name} updated the ticket “${ticket.title}” — now ${ticket.priority}, ${ticket.status.replace("_", " ")}`,
    entityType: "dev_ticket",
    entityId: ticket.id,
    entityLabel: ticket.title,
    ...actorFromUser(gate.user),
    detail: {
      priority: ticket.priority,
      status: ticket.status,
      remindOn: ticket.remindOn ?? null,
      fieldsPosted: Object.keys(b).filter((k) => k !== "id"),
    },
    request,
  });

  return NextResponse.json(ticket);
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // The rows go first: if a blob delete fails we are left with orphaned bytes,
  // which is harmless, whereas the reverse leaves rows pointing at nothing.
  const removed = await deleteDevTicket(id);
  await Promise.all(removed.map((a) => deleteBlob(a.pathname)));

  await logActivity({
    action: "dev_ticket.delete",
    summary: `${gate.user.name} deleted a dev ticket and its ${removed.length} attachment${removed.length === 1 ? "" : "s"}`,
    entityType: "dev_ticket",
    entityId: id,
    ...actorFromUser(gate.user),
    detail: { attachmentsRemoved: removed.map((a) => a.fileName) },
    request,
  });

  return NextResponse.json({ ok: true });
}
