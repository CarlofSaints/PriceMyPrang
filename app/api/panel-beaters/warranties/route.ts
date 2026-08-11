import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeater, upsertPanelBeater } from "@/lib/store";
import { mergeWarranties } from "@/lib/warrantyReminders";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { WarrantyApproval } from "@/lib/types";

/**
 * Add or replace ONE manufacturer warranty on a workshop's listing, so a panel
 * beater can keep their certificates current without reopening the whole
 * registration form. Adding the same manufacturer twice updates it in place —
 * that's how mergeWarranties already behaves, and a workshop can only hold one
 * approval per manufacturer anyway.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    panelBeaterId?: string;
    warranty?: WarrantyApproval;
  };

  // A self-service login can only ever touch its own listing; a manager may
  // name one.
  const targetId = canManage ? body.panelBeaterId || user.panelBeaterId : user.panelBeaterId;
  if (!targetId)
    return NextResponse.json(
      { error: "No workshop is linked to your login." },
      { status: 400 }
    );
  if (!canManage && targetId !== user.panelBeaterId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const w = body.warranty;
  if (!w?.manufacturer?.trim())
    return NextResponse.json({ error: "Choose a manufacturer" }, { status: 400 });
  if (!w.certificate?.url)
    return NextResponse.json(
      { error: `Upload a certificate for the ${w.manufacturer} warranty.` },
      { status: 400 }
    );

  const pb = await getPanelBeater(targetId);
  if (!pb) return NextResponse.json({ error: "Workshop not found" }, { status: 404 });

  const others = (pb.warranties ?? []).filter((x) => x.manufacturer !== w.manufacturer);
  const replaced = (pb.warranties ?? []).length !== others.length;
  pb.warranties = mergeWarranties([...others, w], pb.warranties);

  await upsertPanelBeater(pb);

  const label = pb.tradingAs || pb.companyName;
  await logActivity({
    action: "warranty.upsert",
    summary: `${user.name} ${replaced ? "replaced" : "added"} the ${w.manufacturer} warranty for ${label}`,
    entityType: "panel_beater",
    entityId: pb.id,
    entityLabel: label,
    ...actorFromUser(user),
    // The workshop the warranty belongs to, which is not always the actor's.
    panelBeaterId: pb.id,
    detail: {
      manufacturer: w.manufacturer,
      startDate: w.startDate,
      expiryDate: w.expiryDate,
      certificate: w.certificate?.url,
      replacedExisting: replaced,
    },
    request,
  });

  return NextResponse.json({ ok: true, warranties: pb.warranties });
}
