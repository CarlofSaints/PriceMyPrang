import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getInsurerContacts,
  createInsurerContact,
  updateInsurerContact,
  findInsurerContact,
  deleteInsurerContact,
} from "@/lib/store";
import { logActivity, actorFromUser, diff } from "@/lib/activityLog";
import type { AuthUser } from "@/lib/types";

/**
 * Contacts at an insurer.
 *
 * Two kinds, and the difference is the whole security model:
 *  - GENERIC (panelBeaterId null) — PMP staff maintain them, everyone sees
 *    them. Writing one needs `manage_insurers`.
 *  - PRIVATE (panelBeaterId set)  — the workshop's own handler. Only that
 *    workshop may read or write it, because who a repairer knows at an insurer
 *    is their own commercial relationship, not something to share with the
 *    workshop down the road.
 */

const FORBIDDEN = NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** The workshop whose private contacts this caller owns, if any. */
function ownWorkshop(user: AuthUser): string | undefined {
  return user.panelBeaterId || undefined;
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const insurerId = new URL(request.url).searchParams.get("insurerId");
  if (!insurerId) return NextResponse.json({ error: "insurerId required" }, { status: 400 });

  // Staff see the generic set. A workshop login additionally sees its own.
  // Nobody is ever handed another workshop's contacts.
  return NextResponse.json(await getInsurerContacts(insurerId, ownWorkshop(user)));
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const b = (await request.json()) as {
    insurerId?: string;
    /** True to create a GENERIC contact. Staff only. */
    generic?: boolean;
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  if (!b.insurerId) return NextResponse.json({ error: "insurerId required" }, { status: 400 });

  if (!b.name?.trim() && !b.email?.trim() && !b.phone?.trim())
    return NextResponse.json(
      { error: "Give the contact a name, an email or a phone number." },
      { status: 400 }
    );

  const workshop = ownWorkshop(user);

  if (b.generic) {
    // A generic contact is published to every workshop on the platform.
    if (!can(user, "manage_insurers")) return FORBIDDEN;
    const created = await createInsurerContact({
      insurerId: b.insurerId,
      name: b.name,
      role: b.role,
      email: b.email,
      phone: b.phone,
      notes: b.notes,
    });

    await logActivity({
      action: "insurer_contact.create",
      summary: `${user.name} added the shared insurer contact ${b.name || b.email || b.phone}`,
      entityType: "insurer_contact",
      entityId: created.id,
      entityLabel: b.name || b.email || b.phone,
      ...actorFromUser(user),
      detail: { insurerId: b.insurerId, shared: true, role: b.role, email: b.email, phone: b.phone },
      request,
    });

    return NextResponse.json(created);
  }

  // A private contact belongs to the caller's own workshop. The id comes from
  // the SESSION, never the body — a posted panelBeaterId would let one
  // workshop plant contacts in another's list.
  if (!workshop)
    return NextResponse.json(
      { error: "No workshop is linked to your login." },
      { status: 400 }
    );
  if (!can(user, "manage_additionals")) return FORBIDDEN;

  const created = await createInsurerContact({
    insurerId: b.insurerId,
    panelBeaterId: workshop,
    name: b.name,
    role: b.role,
    email: b.email,
    phone: b.phone,
    notes: b.notes,
  });

  await logActivity({
    action: "insurer_contact.create",
    summary: `${user.name} added their workshop's own insurer contact ${b.name || b.email || b.phone}`,
    entityType: "insurer_contact",
    entityId: created.id,
    entityLabel: b.name || b.email || b.phone,
    ...actorFromUser(user),
    panelBeaterId: workshop,
    detail: { insurerId: b.insurerId, shared: false, role: b.role, email: b.email, phone: b.phone },
    request,
  });

  return NextResponse.json(created);
}

/** May this caller change this particular contact? */
function mayWrite(user: AuthUser, contact: { panelBeaterId?: string }): boolean {
  if (!contact.panelBeaterId) return can(user, "manage_insurers");
  return (
    can(user, "manage_additionals") &&
    !!user.panelBeaterId &&
    contact.panelBeaterId === user.panelBeaterId
  );
}

export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const b = (await request.json()) as {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await findInsurerContact(b.id);
  // Another workshop's contact is a 404, not a 403 — consistent with the rest
  // of this app, and an id must not be a way to learn what exists elsewhere.
  if (!existing || !mayWrite(user, existing))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = {
    name: b.name,
    role: b.role,
    email: b.email,
    phone: b.phone,
    notes: b.notes,
  };
  const updated = await updateInsurerContact(b.id, patch);

  await logActivity({
    action: "insurer_contact.update",
    summary: `${user.name} updated the ${existing.panelBeaterId ? "workshop's own" : "shared"} insurer contact ${existing.name || existing.email || b.id}`,
    entityType: "insurer_contact",
    entityId: b.id,
    entityLabel: existing.name || existing.email,
    ...actorFromUser(user),
    panelBeaterId: existing.panelBeaterId,
    detail: {
      shared: !existing.panelBeaterId,
      changes: diff(existing as unknown as Record<string, unknown>, patch),
    },
    request,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await findInsurerContact(id);
  if (!existing || !mayWrite(user, existing))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteInsurerContact(id);

  await logActivity({
    action: "insurer_contact.delete",
    summary: `${user.name} deleted the ${existing.panelBeaterId ? "workshop's own" : "shared"} insurer contact ${existing.name || existing.email || id}`,
    entityType: "insurer_contact",
    entityId: id,
    entityLabel: existing.name || existing.email,
    ...actorFromUser(user),
    panelBeaterId: existing.panelBeaterId,
    detail: { shared: !existing.panelBeaterId, insurerId: existing.insurerId, email: existing.email },
    request,
  });

  return NextResponse.json({ ok: true });
}
