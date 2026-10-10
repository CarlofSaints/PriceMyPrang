// Proves the workshop-scoping rules in lib/workshopAccess.ts.
// Run: npm run test:authz
//
// Every refusal is paired with the legitimate case it must still allow, so a
// rule that simply refuses everything fails here too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSIONS } from "../lib/permissions";
import {
  additionalsListScope,
  isAssignedTo,
  panelBeaterSaveTarget,
  panelBeatersVisibleTo,
  requestViewFor,
  vettingFields,
} from "../lib/workshopAccess";
import type { Permission, PanelBeater, QuoteRequest } from "../lib/types";

const A = "workshop-a";
const B = "workshop-b";

const workshopA = {
  panelBeaterId: A,
  permissions: ["onboard_self", "manage_additionals", "manage_own_complaints"] as Permission[],
};
const unlinkedWorkshop = { panelBeaterId: undefined, permissions: ["onboard_self"] as Permission[] };
const assessor = {
  panelBeaterId: undefined,
  permissions: ["view_dashboard", "build_quotes", "manage_panel_beaters"] as Permission[],
};
const admin = { panelBeaterId: undefined, permissions: [...ALL_PERMISSIONS] };
const customRoleNoWorkshop = {
  panelBeaterId: undefined,
  permissions: ["manage_additionals"] as Permission[],
};

const listing = (id: string, extra: Partial<PanelBeater> = {}) =>
  ({ id, companyName: id, active: true, status: "approved", ...extra }) as PanelBeater;

const job = (selected: string[]) =>
  ({
    reference: "PMP-20261008-SMITH-03",
    publicToken: "secret-client-link",
    selectedPanelBeaterIds: selected,
    quotes: [
      { id: "qa", panelBeaterId: A },
      { id: "qb", panelBeaterId: B },
    ],
  }) as unknown as QuoteRequest;

// ── Hole 1: additionals on a job never sent to the workshop ─────────────────
test("hole 1: a workshop can't act on a job that wasn't sent to it", () => {
  assert.equal(isAssignedTo(job([B]), A), false);
  assert.equal(isAssignedTo(job([A, B]), A), true);
  assert.equal(isAssignedTo(job([A]), undefined), false);
});

test("hole 1 (GET): no workshop is a refusal, not every workshop", () => {
  assert.deepEqual(additionalsListScope(customRoleNoWorkshop, null), { ok: false });
  assert.deepEqual(additionalsListScope(workshopA, A), { ok: true, panelBeaterId: A });
  assert.deepEqual(additionalsListScope(assessor, null), { ok: true, panelBeaterId: undefined });
});

// ── Hole 2: client link token and rival quotes ──────────────────────────────
test("hole 2: a workshop gets no client token, no rival quote, no rival names", () => {
  const view = requestViewFor(workshopA, job([A, B]));
  assert.equal(view.publicToken, undefined);
  assert.deepEqual(view.quotes.map((q) => q.id), ["qa"]);
  assert.deepEqual(view.selectedPanelBeaterIds, [A]);
});

test("hole 2: staff still see the whole job", () => {
  const view = requestViewFor(assessor, job([A, B]));
  assert.equal(view.publicToken, "secret-client-link");
  assert.equal(view.quotes.length, 2);
  assert.deepEqual(view.selectedPanelBeaterIds, [A, B]);
});

// ── Hole 3: self-approval and fake listings ─────────────────────────────────
const exists = (ids: string[]) => (id: string) => ids.includes(id);

test("hole 3: a workshop can't save another listing or mint a new one", () => {
  assert.deepEqual(panelBeaterSaveTarget(workshopA, B, exists([A, B])), { ok: false });
  assert.deepEqual(panelBeaterSaveTarget(workshopA, "brand-new", exists([A, B])), { ok: false });
  // No id at all lands on its OWN listing, never a fresh one.
  assert.deepEqual(panelBeaterSaveTarget(workshopA, undefined, exists([A, B])), { ok: true, id: A });
  assert.deepEqual(panelBeaterSaveTarget(workshopA, A, exists([A, B])), { ok: true, id: A });
});

test("hole 3: an unlinked login may create its first listing, not edit others", () => {
  assert.deepEqual(panelBeaterSaveTarget(unlinkedWorkshop, B, exists([B])), { ok: false });
  assert.deepEqual(panelBeaterSaveTarget(unlinkedWorkshop, undefined, exists([B])), {
    ok: true,
    id: undefined,
  });
});

test("hole 3: staff can edit any listing and create new ones", () => {
  assert.deepEqual(panelBeaterSaveTarget(assessor, B, exists([A, B])), { ok: true, id: B });
  assert.deepEqual(panelBeaterSaveTarget(assessor, undefined, exists([A, B])), {
    ok: true,
    id: undefined,
  });
});

test("hole 3: a workshop can't approve or reactivate itself", () => {
  const pending = listing(A, { active: false, status: "pending", submittedByPublic: true });
  const forged = { active: true, status: "approved" as const, submittedByPublic: false };
  assert.deepEqual(vettingFields(workshopA, forged, pending), {
    active: false,
    status: "pending",
    submittedByPublic: true,
  });
  // A brand-new self-onboarded listing starts pending whatever the body says.
  assert.equal(vettingFields(unlinkedWorkshop, forged, null).status, "pending");
});

test("hole 3: staff still set the vetting fields", () => {
  const pending = listing(A, { active: false, status: "pending" });
  const v = vettingFields(admin, { active: true, status: "approved" }, pending);
  assert.equal(v.active, true);
  assert.equal(v.status, "approved");
});

// ── Hole 4: unfiltered listing GET ──────────────────────────────────────────
test("hole 4: a login with no listing sees none, a workshop only its own", () => {
  const all = [listing(A), listing(B)];
  assert.deepEqual(panelBeatersVisibleTo(unlinkedWorkshop, all), []);
  assert.deepEqual(panelBeatersVisibleTo(workshopA, all).map((p) => p.id), [A]);
  assert.equal(panelBeatersVisibleTo(assessor, all).length, 2);
});
