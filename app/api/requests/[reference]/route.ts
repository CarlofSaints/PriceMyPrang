import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRequest, updateRequestStatus } from "@/lib/store";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { RequestStatus } from "@/lib/types";

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
  const privileged = can(user, "view_dashboard") || can(user, "build_quotes");
  if (!privileged) {
    const ownsIt =
      can(user, "onboard_self") &&
      !!user.panelBeaterId &&
      req.selectedPanelBeaterIds.includes(user.panelBeaterId);
    if (!ownsIt) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(req);
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
  const { status } = (await request.json()) as { status?: RequestStatus };
  const valid: RequestStatus[] = ["new", "in_progress", "completed"];
  if (!status || !valid.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const req = await getRequest(reference);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
