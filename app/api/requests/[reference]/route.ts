import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRequest, saveRequest } from "@/lib/store";
import type { RequestStatus } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "view_dashboard") && !can(user, "build_quotes"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reference } = await params;
  const req = await getRequest(reference);
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(req);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  req.status = status;
  await saveRequest(req);
  return NextResponse.json({ ok: true, status });
}
