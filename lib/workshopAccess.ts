import { can } from "@/lib/permissions";
import type { AuthUser, PanelBeater, QuoteRequest } from "@/lib/types";

// ---------------------------------------------------------------------------
// One rule, decided in one place: a workshop login only ever touches its OWN
// rows. Pure functions (no database) so scripts/test-authz.ts can prove each
// refusal without a server.
// ---------------------------------------------------------------------------

type Caller = Pick<AuthUser, "permissions" | "panelBeaterId">;

/** Was this job sent to this workshop? */
export function isAssignedTo(
  job: { selectedPanelBeaterIds: string[] },
  panelBeaterId: string | null | undefined
): boolean {
  return !!panelBeaterId && job.selectedPanelBeaterIds.includes(panelBeaterId);
}

/**
 * Which workshop's additionals a GET may list.
 *
 * `acting` is actingWorkshop()'s answer. Null means "no workshop", which is
 * only "every workshop" for staff who manage panel beaters; for anyone else it
 * is a refusal, never an unfiltered list.
 */
export function additionalsListScope(
  user: Caller,
  acting: string | null
): { ok: true; panelBeaterId: string | undefined } | { ok: false } {
  if (acting) return { ok: true, panelBeaterId: acting };
  if (can(user, "manage_panel_beaters")) return { ok: true, panelBeaterId: undefined };
  return { ok: false };
}

/** Staff who may see a whole job: every workshop's quote and the client's link. */
export function seesWholeJob(user: Caller): boolean {
  return can(user, "view_dashboard") || can(user, "build_quotes");
}

/**
 * The job as a workshop login may see it.
 *
 * Removed: the client's private link token (it accepts quotes and opens the
 * pay page as the client), every other workshop's quote, and which other
 * workshops were sent the job.
 */
export function requestViewFor(user: Caller, req: QuoteRequest): QuoteRequest {
  if (seesWholeJob(user)) return req;
  const own = user.panelBeaterId;
  const view: QuoteRequest = {
    ...req,
    quotes: req.quotes.filter((q) => q.panelBeaterId === own),
    selectedPanelBeaterIds: req.selectedPanelBeaterIds.filter((id) => id === own),
  };
  delete view.publicToken;
  return view;
}

/** The listings a caller may read. */
export function panelBeatersVisibleTo(user: Caller, list: PanelBeater[]): PanelBeater[] {
  if (can(user, "manage_panel_beaters")) return list;
  // No workshop linked yet means nothing to see, NOT everything.
  if (!user.panelBeaterId) return [];
  return list.filter((p) => p.id === user.panelBeaterId);
}

/**
 * Whether a save to a listing may go ahead, and which listing it lands on.
 *
 * A workshop login with a listing can only ever save THAT listing, whatever id
 * the body names. One with no listing yet may create its first (self-onboard).
 */
export function panelBeaterSaveTarget(
  user: Caller,
  requestedId: string | undefined,
  exists: (id: string) => boolean
): { ok: true; id: string | undefined } | { ok: false } {
  if (can(user, "manage_panel_beaters")) {
    return { ok: true, id: requestedId && exists(requestedId) ? requestedId : undefined };
  }
  if (user.panelBeaterId) {
    if (requestedId && requestedId !== user.panelBeaterId) return { ok: false };
    return { ok: true, id: user.panelBeaterId };
  }
  // Self-onboarding: creating a first listing only, never editing someone else's.
  if (requestedId && exists(requestedId)) return { ok: false };
  return { ok: true, id: undefined };
}

/**
 * The vetting fields. Only staff who manage panel beaters set them; for a
 * workshop editing its own listing they always keep their stored values, and a
 * brand-new self-onboarded listing starts pending.
 */
export function vettingFields(
  user: Caller,
  body: Pick<Partial<PanelBeater>, "active" | "status" | "submittedByPublic">,
  existing: PanelBeater | null | undefined
): Pick<PanelBeater, "active" | "status" | "submittedByPublic"> {
  if (can(user, "manage_panel_beaters")) {
    return {
      active: body.active ?? existing?.active ?? true,
      status: body.status ?? existing?.status ?? "pending",
      submittedByPublic: body.submittedByPublic ?? existing?.submittedByPublic,
    };
  }
  return {
    active: existing?.active ?? true,
    status: existing?.status ?? "pending",
    submittedByPublic: existing?.submittedByPublic,
  };
}
