import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listComplaints,
  getComplaint,
  updateComplaintStatus,
  addComplaintNote,
} from "@/lib/store";
import { COMPLAINT_STATUSES, type ComplaintStatus, type Complaint } from "@/lib/types";

// One route, two audiences. A workshop sees complaints against ITSELF; PMP
// staff see every one. The scope is decided here from the permission, never
// from a panelBeaterId in the query — that would let a workshop read another's.

type Scope =
  | { error: NextResponse }
  | { all: true; panelBeaterId?: undefined }
  | { all: false; panelBeaterId: string };

async function scope(): Promise<Scope & { user?: { name: string } }> {
  const { user, response } = await requireUser();
  if (response) return { error: response };

  if (can(user, "manage_complaints")) return { all: true, user };
  if (can(user, "manage_own_complaints")) {
    if (!user.panelBeaterId)
      return { error: NextResponse.json({ error: "No workshop on this login" }, { status: 400 }) };
    return { all: false, panelBeaterId: user.panelBeaterId, user };
  }
  return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

/**
 * Internal notes are stripped for a workshop. They are where Price my Prang
 * records its own view of a dispute, which is not for the party being
 * complained about.
 */
function forAudience(c: Complaint, all: boolean): Complaint {
  return all ? c : { ...c, notes: c.notes.filter((n) => !n.internal) };
}

export async function GET(request: Request) {
  const s = await scope();
  if ("error" in s) return s.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const complaints = await listComplaints({
    status: COMPLAINT_STATUSES.includes(status as ComplaintStatus)
      ? (status as ComplaintStatus)
      : undefined,
    panelBeaterId: s.all ? undefined : s.panelBeaterId,
  });

  return NextResponse.json({
    complaints: complaints.map((c) => forAudience(c, s.all)),
    canManageAll: s.all,
  });
}

/** Move a complaint along. Both audiences may; a workshop only on its own. */
export async function PATCH(request: Request) {
  const s = await scope();
  if ("error" in s) return s.error;

  const b = (await request.json()) as { id?: string; status?: string };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!COMPLAINT_STATUSES.includes(b.status as ComplaintStatus))
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });

  // Ownership first. 404 rather than 403 so ids can't be probed.
  const existing = await getComplaint(b.id);
  if (!existing || (!s.all && existing.panelBeaterId !== s.panelBeaterId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await updateComplaintStatus(b.id, b.status as ComplaintStatus);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(forAudience(updated, s.all));
}

/**
 * Record how a complaint was dealt with. This is the part Jerome's ticket is
 * actually about — the repairer writing down what they did about it.
 */
export async function POST(request: Request) {
  const s = await scope();
  if ("error" in s) return s.error;

  const b = (await request.json()) as { id?: string; body?: string; internal?: boolean };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const text = typeof b.body === "string" ? b.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });

  const existing = await getComplaint(b.id);
  if (!existing || (!s.all && existing.panelBeaterId !== s.panelBeaterId))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A workshop can NEVER write an internal note — that flag is what keeps a
  // note out of their own view, so letting them set it would be incoherent.
  const internal = s.all ? !!b.internal : false;

  const updated = await addComplaintNote(b.id, {
    body: text.slice(0, 5000),
    authorName: s.user?.name ?? "Unknown",
    internal,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(forAudience(updated, s.all));
}
