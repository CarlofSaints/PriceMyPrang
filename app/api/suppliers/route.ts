import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSuppliers, saveSuppliers } from "@/lib/store";
import type { PartType, Supplier } from "@/lib/types";

const PART_TYPE_VALUES: PartType[] = ["new", "used", "alternate"];

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "supplier"}_${crypto.randomUUID().slice(0, 6)}`;
}

function cleanPartTypes(input: unknown): PartType[] {
  if (!Array.isArray(input)) return [];
  return PART_TYPE_VALUES.filter((t) => input.includes(t));
}

function cleanMakes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of input) {
    const s = String(m).trim();
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

async function requireManage() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!can(user, "manage_parts"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireManage();
  if (gate.error) return gate.error;
  return NextResponse.json(await getSuppliers());
}

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as Partial<Supplier>;
  if (!b.name?.trim()) return NextResponse.json({ error: "Supplier name required" }, { status: 400 });

  const list = await getSuppliers();
  if (list.some((s) => s.name.trim().toLowerCase() === b.name!.trim().toLowerCase()))
    return NextResponse.json({ error: "A supplier with that name already exists" }, { status: 409 });

  const supplier: Supplier = {
    id: slugId(b.name.trim()),
    name: b.name.trim(),
    partTypes: cleanPartTypes(b.partTypes),
    makes: cleanMakes(b.makes),
    supplies: b.supplies?.trim() || undefined,
    email: b.email?.trim() || undefined,
    phone: b.phone?.trim() || undefined,
    active: true,
    createdAt: new Date().toISOString(),
  };
  list.push(supplier);
  await saveSuppliers(list);
  return NextResponse.json(supplier);
}

export async function PATCH(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as Partial<Supplier> & { id?: string };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getSuppliers();
  const supplier = list.find((s) => s.id === b.id);
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.name?.trim()) {
    if (
      list.some(
        (s) => s.id !== supplier.id && s.name.trim().toLowerCase() === b.name!.trim().toLowerCase()
      )
    )
      return NextResponse.json({ error: "A supplier with that name already exists" }, { status: 409 });
    supplier.name = b.name.trim();
  }
  if (b.partTypes !== undefined) supplier.partTypes = cleanPartTypes(b.partTypes);
  if (b.makes !== undefined) supplier.makes = cleanMakes(b.makes);
  if (b.supplies !== undefined) supplier.supplies = b.supplies?.trim() || undefined;
  if (b.email !== undefined) supplier.email = b.email?.trim() || undefined;
  if (b.phone !== undefined) supplier.phone = b.phone?.trim() || undefined;
  if (typeof b.active === "boolean") supplier.active = b.active;

  await saveSuppliers(list);
  return NextResponse.json(supplier);
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getSuppliers();
  if (!list.some((s) => s.id === id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await saveSuppliers(list.filter((s) => s.id !== id));
  return NextResponse.json({ ok: true });
}
