import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRateTypes, saveRateTypes } from "@/lib/store";
import type { RateType, RateUnit } from "@/lib/types";

const UNITS: RateUnit[] = ["rand_per_hour", "rand", "percent"];

function slugId(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "rate"}_${crypto.randomUUID().slice(0, 6)}`;
}

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!can(user, "manage_rate_types"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;
  return NextResponse.json(await getRateTypes());
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const b = (await request.json()) as {
    label?: string;
    unit?: RateUnit;
    group?: string;
  };
  if (!b.label?.trim()) return NextResponse.json({ error: "Rate name required" }, { status: 400 });
  const unit: RateUnit = UNITS.includes(b.unit as RateUnit) ? (b.unit as RateUnit) : "rand";

  const list = await getRateTypes();
  if (list.some((r) => r.label.trim().toLowerCase() === b.label!.trim().toLowerCase()))
    return NextResponse.json({ error: "A rate with that name already exists" }, { status: 409 });

  const maxOrder = list.reduce((m, r) => Math.max(m, r.order), 0);
  const rate: RateType = {
    id: slugId(b.label.trim()),
    label: b.label.trim(),
    unit,
    group: b.group?.trim() || undefined,
    order: maxOrder + 10,
    active: true,
    createdAt: new Date().toISOString(),
  };
  list.push(rate);
  await saveRateTypes(list);
  return NextResponse.json(rate);
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const b = (await request.json()) as {
    id?: string;
    label?: string;
    unit?: RateUnit;
    group?: string | null;
    active?: boolean;
    order?: number;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getRateTypes();
  const rate = list.find((r) => r.id === b.id);
  if (!rate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.label?.trim()) {
    if (
      list.some(
        (r) => r.id !== rate.id && r.label.trim().toLowerCase() === b.label!.trim().toLowerCase()
      )
    )
      return NextResponse.json({ error: "A rate with that name already exists" }, { status: 409 });
    rate.label = b.label.trim();
  }
  if (b.unit && UNITS.includes(b.unit)) rate.unit = b.unit;
  if (b.group !== undefined) rate.group = b.group?.trim() || undefined;
  if (typeof b.active === "boolean") rate.active = b.active;
  if (typeof b.order === "number") rate.order = b.order;

  await saveRateTypes(list);
  return NextResponse.json(rate);
}

export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getRateTypes();
  if (!list.some((r) => r.id === id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await saveRateTypes(list.filter((r) => r.id !== id));
  return NextResponse.json({ ok: true });
}
