import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getParts, saveParts } from "@/lib/store";
import { netPrice, type Part } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "build_quotes") && !can(user, "manage_parts") && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getParts());
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_parts"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as Partial<Part>;
  if (!b.supplier?.trim() || !b.name?.trim())
    return NextResponse.json({ error: "Supplier and part name required" }, { status: 400 });

  const listPrice = Number(b.listPrice) || 0;
  const discountPercentage = b.discountPercentage != null ? Number(b.discountPercentage) : undefined;

  const parts = await getParts();
  const part: Part = {
    id: crypto.randomUUID(),
    supplier: b.supplier.trim(),
    partNumber: b.partNumber?.trim() || undefined,
    name: b.name.trim(),
    category: b.category?.trim() || undefined,
    listPrice,
    discountPercentage,
    price: netPrice(listPrice, discountPercentage),
    avgLeadTime: b.avgLeadTime?.toString().trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  parts.push(part);
  await saveParts(parts);
  return NextResponse.json(part);
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_parts"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const parts = (await getParts()).filter((p) => p.id !== id);
  await saveParts(parts);
  return NextResponse.json({ ok: true });
}
