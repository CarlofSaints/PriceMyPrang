import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listSuppliersForPanelBeater,
  createPanelBeaterSupplier,
  updatePanelBeaterSupplier,
  deletePanelBeaterSupplier,
} from "@/lib/store";
import type { Supplier } from "@/lib/types";

// A workshop's OWN supplier book. Separate from /api/suppliers, which is Price
// my Prang's platform-wide list under manage_parts.
//
// The workshop id ALWAYS comes from the session, never the request body — a
// posted panelBeaterId would let one repairer write into another's book, and
// their supplier list is commercially sensitive (it is who they buy from and,
// by implication, at what price).

type Gate =
  | { error: NextResponse }
  | { panelBeaterId: string; canEdit: boolean };

async function gate(): Promise<Gate> {
  const { user, response } = await requireUser();
  if (response) return { error: response };

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

  return { panelBeaterId: user.panelBeaterId, canEdit };
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

export async function GET() {
  const g = await gate();
  if ("error" in g) return g.error;
  return NextResponse.json({
    suppliers: await listSuppliersForPanelBeater(g.panelBeaterId),
    canEdit: g.canEdit,
  });
}

export async function POST(request: Request) {
  const g = await gate();
  if ("error" in g) return g.error;
  if (!g.canEdit) return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const b = (await request.json()) as Record<string, unknown>;
  const f = fields(b);
  // Nothing else is required — a buyer adding a supplier mid-job shouldn't be
  // stopped by a VAT number they'd have to go and find.
  if (!f.name) return NextResponse.json({ error: "Supplier company name is required" }, { status: 400 });

  return NextResponse.json(await createPanelBeaterSupplier(g.panelBeaterId, { ...f, name: f.name }));
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

  const updated = await updatePanelBeaterSupplier(id, g.panelBeaterId, f);
  // 404 rather than 403: another workshop's supplier must not be discoverable
  // by probing ids.
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const g = await gate();
  if ("error" in g) return g.error;
  if (!g.canEdit) return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await deletePanelBeaterSupplier(id, g.panelBeaterId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
