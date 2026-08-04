import { can } from "@/lib/permissions";
import type { AuthUser } from "@/lib/types";

/**
 * Which workshop a caller is acting as when working on additionals.
 *
 * A panel-beater login is pinned to its own listing — a posted id is never
 * trusted, or one workshop could raise additionals in another's name. PMP staff
 * who manage panel beaters may act on a NAMED workshop, because assessors price
 * jobs too, but they must say which since they have no workshop of their own.
 *
 * Shared by /api/additionals and /api/additionals/send so the two can't drift
 * apart: they reach the same rows, and the send is the irreversible one.
 */
export function actingWorkshop(user: AuthUser, requested?: string): string | null {
  if (user.panelBeaterId) return user.panelBeaterId;
  if (can(user, "manage_panel_beaters")) return requested || null;
  return null;
}
