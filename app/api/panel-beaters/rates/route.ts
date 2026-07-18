import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeater, upsertPanelBeater, getRateTypes } from "@/lib/store";

// Save a panel beater's own rate card. Panel-beater logins may only edit their
// own listing; managers (manage_panel_beaters) may edit any.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canManage = can(user, "manage_panel_beaters");
  const canSelf = can(user, "onboard_self");
  if (!canManage && !canSelf)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    panelBeaterId?: string;
    rates?: Record<string, unknown>;
  };
  const targetId = b.panelBeaterId || user.panelBeaterId;
  if (!targetId) return NextResponse.json({ error: "No panel beater specified" }, { status: 400 });

  // Self-service users can only touch their own listing.
  if (!canManage && targetId !== user.panelBeaterId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pb = await getPanelBeater(targetId);
  if (!pb) return NextResponse.json({ error: "Panel beater not found" }, { status: 404 });

  // Keep only known rate-type ids with finite, non-negative numeric values.
  const rateTypes = await getRateTypes();
  const validIds = new Set(rateTypes.map((r) => r.id));
  const clean: Record<string, number> = {};
  for (const [id, raw] of Object.entries(b.rates ?? {})) {
    if (!validIds.has(id)) continue;
    if (raw === "" || raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) clean[id] = n;
  }

  pb.rates = clean;
  await upsertPanelBeater(pb);
  return NextResponse.json({ ok: true, rates: clean });
}
