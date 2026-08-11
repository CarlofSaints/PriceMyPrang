import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listSuppliersForPanelBeater,
  createPanelBeaterSupplier,
  updatePanelBeaterSupplier,
  deletePanelBeaterSupplier,
} from "@/lib/store";
import { logActivity, actorFromUser, diff } from "@/lib/activityLog";
import type { AuthUser, Supplier } from "@/lib/types";

// A workshop's OWN supplier book. Separate from /api/suppliers, which is Price
// my Prang's platform-wide list under manage_parts.
//
// For a workshop's own login the id comes from the SESSION and nowhere else — a
// posted panelBeaterId would let one repairer read or write another's book, and
// a supplier list is commercially sensitive (it is who they buy from and, by
// implication, at what price).
//
// The single exception is PMP staff building a quote on a workshop's behalf:
// they need that workshop's suppliers and have none of their own. See gate().

type Gate =
  | { error: NextResponse }
  // The user is carried through so the activity log can attribute the change.
  | { panelBeaterId: string; canEdit: boolean; user: AuthUser };

/**
 * @param target a workshop id from the caller. HONOURED ONLY for PMP staff
 *   building a quote on a workshop's behalf — they need that workshop's
 *   supplier book, not their own (they have none). A workshop's own login can
 *   never use it, or one repairer could read another's suppliers.
 */
async function gate(target?: string | null): Promise<Gate> {
  const { user, response } = await requireUser();
  if (response) return { error: response };

  const isStaff = can(user, "build_quotes") || can(user, "manage_panel_beaters");
  if (target && isStaff) return { panelBeaterId: target, canEdit: true, user };

  const canEdit = can(user, "manage_own_suppliers");
  if (!canEdit && !can(user, "view_own_suppliers"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  if (!user.panelBeaterId)
    return {
      error: NextResponse.json(
        { error: "This login is not linked to a workshop." },
        { status: 400 }
      ),
    };

  return { panelBeaterId: user.panelBeaterId, canEdit, user };
}

/** Everything the form may set. `name` is the only one the API insists on. */
function fields(b: Record<string, unknown>): Partial<Supplier> {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    name: s(b.name),
    supplies: s(b.supplies),
    email: s(b.email),
    phone: s(b.phone),
    companyRegNumber: s(b.companyRegNumber),
    vatNumber: s(b.vatNumber),
    address: s(b.address),
    mainContactName: s(b.mainContactName),
    mainContactPhone: s(b.mainContactPhone),
    mainContactEmail: s(b.mainContactEmail),
    billingContactName: s(b.billingContactName),
    billingContactPhone: s(b.billingContactPhone),
    billingContactEmail: s(b.billingContactEmail),
  };
}

export async function GET(request: Request) {
  const g = await gate(new URL(request.url).searchParams.get("panelBeaterId"));
  if ("error" in g) return g.error;
  return NextResponse.json({
    suppliers: await listSuppliersForPanelBeater(g.panelBeaterId),
    canEdit: g.canEdit,
  });
}

export async function POST(request: Request) {
  const b0 = (await request.clone().json()) as { panelBeaterId?: string };
  const g = await gate(b0.panelBeaterId);
  if ("error" in g) return g.error;
  if (!g.canEdit) return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const b = (await request.json()) as Record<string, unknown>;
  const f = fields(b);
  // Nothing else is required — a buyer adding a supplier mid-job shouldn't be
  // stopped by a VAT number they'd have to go and find.
  if (!f.name) return NextResponse.json({ error: "Supplier company name is required" }, { status: 400 });

  const created = await createPanelBeaterSupplier(g.panelBeaterId, { ...f, name: f.name });

  await logActivity({
    action: "supplier.own.create",
    summary: `${g.user.name} added ${created.name} to the workshop's supplier book`,
    entityType: "supplier",
    entityId: created.id,
    entityLabel: created.name,
    ...actorFromUser(g.user),
    // The workshop the BOOK belongs to, which is not the actor's own when PMP
    // staff are adding one mid-quote on a workshop's behalf.
    panelBeaterId: g.panelBeaterId,
    detail: f,
    request,
  });

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const g = await gate();
  if ("error" in g) return g.error;
  if (!g.canEdit) return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const b = (await request.json()) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const f = fields(b);
  if (b.name !== undefined && !f.name)
    return NextResponse.json({ error: "Supplier company name is required" }, { status: 400 });

  const existing = (await listSuppliersForPanelBeater(g.panelBeaterId)).find((s) => s.id === id);
  const updated = await updatePanelBeaterSupplier(id, g.panelBeaterId, f);
  // 404 rather than 403: another workshop's supplier must not be discoverable
  // by probing ids.
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    action: "supplier.own.update",
    summary: `${g.user.name} updated the supplier ${updated.name}`,
    entityType: "supplier",
    entityId: updated.id,
    entityLabel: updated.name,
    ...actorFromUser(g.user),
    panelBeaterId: g.panelBeaterId,
    detail: { changes: diff(existing as unknown as Record<string, unknown>, f) },
    request,
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const g = await gate();
  if ("error" in g) return g.error;
  if (!g.canEdit) return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = (await listSuppliersForPanelBeater(g.panelBeaterId)).find((s) => s.id === id);
  const ok = await deletePanelBeaterSupplier(id, g.panelBeaterId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    action: "supplier.own.delete",
    summary: `${g.user.name} removed ${existing?.name ?? "a supplier"} from the workshop's supplier book`,
    entityType: "supplier",
    entityId: id,
    entityLabel: existing?.name,
    ...actorFromUser(g.user),
    panelBeaterId: g.panelBeaterId,
    request,
  });

  return NextResponse.json({ ok: true });
}
