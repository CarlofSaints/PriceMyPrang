import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getParts, saveParts } from "@/lib/store";
import type { Part } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "build_quotes") && !can(user, "manage_parts"))
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

  const parts = await getParts();
  const part: Part = {
    id: crypto.randomUUID(),
    supplier: b.supplier.trim(),
    name: b.name.trim(),
    partNumber: b.partNumber?.trim() || undefined,
    price: Number(b.price) || 0,
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
