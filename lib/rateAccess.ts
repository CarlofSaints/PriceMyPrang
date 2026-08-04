import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";

/**
 * The workshop a caller may touch on the rates pages: their own, or one a
 * manager names.
 *
 * Shared by /api/rate-cards and /api/rate-cards/custom-types on purpose.
 * Custom rates are priced on a card, so the two endpoints reach the same data
 * and must agree about who owns it — a second copy of this check is a second
 * thing to remember to fix.
 */
export async function resolveRateTarget(
  user: { panelBeaterId?: string; permissions?: string[] },
  requested?: string
): Promise<{ id: string } | { error: NextResponse }> {
  const canManage = can(user as never, "manage_panel_beaters");
  if (!canManage && !can(user as never, "onboard_self"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const id = canManage ? requested || user.panelBeaterId : user.panelBeaterId;
  if (!id)
    return {
      error: NextResponse.json({ error: "No workshop is linked to your login." }, { status: 400 }),
    };
  // A self-service login is confined to its own listing.
  if (!canManage && id !== user.panelBeaterId)
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { id };
}
