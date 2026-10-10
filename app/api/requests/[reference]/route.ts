import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getRequest,
  updateRequestStatus,
  setRequestPanelBeaters,
  getPanelBeaters,
} from "@/lib/store";
import { sendRepairerJobAssigned } from "@/lib/email";
import { isAssignedTo, requestViewFor, seesWholeJob } from "@/lib/workshopAccess";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { AuthUser } from "@/lib/types";
import { parseJson } from "@/lib/validate";
import { UpdateRequestBody } from "@/lib/schemas/requests";
import { limitOrRespond } from "@/lib/rateLimit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { reference } = await params;
  const req = await getRequest(reference);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Assessors/admins see any request. A panel-beater login may only see requests
  // assigned to their own listing (so they can quote their own walk-ins).
  if (!seesWholeJob(user)) {
    const ownsIt = can(user, "onboard_self") && isAssignedTo(req, user.panelBeaterId);
    if (!ownsIt) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A workshop gets its own slice only: no client link token, no rival quotes.
  return NextResponse.json(requestViewFor(user, req));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "view_dashboard"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reference } = await params;
  const parsed = await parseJson(request, UpdateRequestBody, "PATCH /api/requests/[reference]");
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  const req = await getRequest(reference);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Putting workshops on a job is a separate act from moving its status, and a
  // separate permission: it is what actually sends a customer's photos to a
  // business, so a plain dashboard viewer must not be able to do it.
  if (body.panelBeaterIds) {
    if (!can(user, "manage_panel_beaters"))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Assigning emails every newly added workshop. Status changes send
    // nothing, so they aren't counted.
    const limited = await limitOrRespond("assignJob", user.id);
    if (limited) return limited;
    return assignWorkshops(request, user, reference, body.panelBeaterIds);
  }

  // The schema only lets a known status through; a missing one still gets this.
  const { status } = body;
  if (!status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await updateRequestStatus(reference, status);

  await logActivity({
    action: "request.status",
    summary: `${user.name} moved ${reference} to ${status.replace("_", " ")}`,
    entityType: "request",
    entityId: req.reference,
    entityLabel: reference,
    ...actorFromUser(user),
    detail: { from: req.status, to: status },
    request,
  });

  return NextResponse.json({ ok: true, status });
}

/**
 * Replace the workshops on a request and tell the new ones.
 *
 * This is how a job reaches a repairer now that the consumer no longer picks
 * one off a map. Only NEWLY added workshops are emailed: re-saving the same
 * list, or dropping somebody, must not put the job in an inbox twice.
 *
 * Each send is logged with its own outcome rather than swallowed. A workshop
 * that never heard about a job is the exact failure this feature exists to
 * prevent, so "we sent it" has to be a matter of record.
 */
async function assignWorkshops(
  request: Request,
  user: AuthUser,
  reference: string,
  rawIds: string[]
) {
  const all = await getPanelBeaters();
  const byId = new Map(all.map((pb) => [pb.id, pb]));

  const ids = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length)
    return NextResponse.json({ error: "Unknown workshop selected" }, { status: 400 });

  const { added, removed } = await setRequestPanelBeaters(reference, ids);

  // Re-read so the email carries the request as it now stands.
  const req = await getRequest(reference);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nameOf = (id: string) => {
    const pb = byId.get(id);
    return pb ? pb.tradingAs || pb.companyName : id;
  };

  await logActivity({
    action: "request.assign",
    summary:
      added.length || removed.length
        ? `${user.name} assigned ${reference} to ${
            ids.length === 0 ? "nobody" : ids.map(nameOf).join(", ")
          }`
        : `${user.name} saved the workshops on ${reference} unchanged`,
    entityType: "request",
    entityId: req.reference,
    entityLabel: reference,
    ...actorFromUser(user),
    detail: {
      added: added.map(nameOf),
      removed: removed.map(nameOf),
      workshops: ids.length,
    },
    request,
  });

  for (const id of added) {
    const pb = byId.get(id)!;
    const recipients = [pb.completedByEmail, pb.ownerEmail].filter(Boolean);
    let error: string | null = null;
    try {
      await sendRepairerJobAssigned(req, pb);
    } catch (err) {
      error = (err as Error).message;
      console.error("repairer job assignment email failed", err);
    }
    await logActivity({
      action: "request.assign.notify",
      summary: error
        ? `Could not email ${nameOf(id)} about ${reference}`
        : recipients.length === 0
          ? `${nameOf(id)} has no email address on file, so nobody was told about ${reference}`
          : `Emailed ${nameOf(id)} about ${reference}`,
      outcome: error || recipients.length === 0 ? "failed" : "success",
      entityType: "request",
      entityId: req.reference,
      entityLabel: reference,
      ...actorFromUser(user),
      panelBeaterId: id,
      detail: { to: recipients, error: error ?? undefined },
      request,
    });
  }

  return NextResponse.json({ ok: true, panelBeaterIds: ids, added, removed });
}
