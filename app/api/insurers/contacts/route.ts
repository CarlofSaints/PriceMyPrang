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
    return NextResponse.json(
      await createInsurerContact({
        insurerId: b.insurerId,
        name: b.name,
        role: b.role,
        email: b.email,
        phone: b.phone,
        notes: b.notes,
      })
    );
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

  return NextResponse.json(
    await createInsurerContact({
      insurerId: b.insurerId,
      panelBeaterId: workshop,
      name: b.name,
      role: b.role,
      email: b.email,
      phone: b.phone,
      notes: b.notes,
    })
  );
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

  return NextResponse.json(
    await updateInsurerContact(b.id, {
      name: b.name,
      role: b.role,
      email: b.email,
      phone: b.phone,
      notes: b.notes,
    })
  );
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
  return NextResponse.json({ ok: true });
}
