import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInsurers, saveInsurers, getRateTypes } from "@/lib/store";
import type { InsuranceCompany } from "@/lib/types";

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "insurer"}_${crypto.randomUUID().slice(0, 6)}`;
}

async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!can(user, "manage_insurers"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

// Keep only known rate-type ids with finite, non-negative numeric values.
async function cleanRates(input: Record<string, unknown> | undefined): Promise<Record<string, number>> {
  const rateTypes = await getRateTypes();
  const valid = new Set(rateTypes.map((r) => r.id));
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(input ?? {})) {
    if (!valid.has(id)) continue;
    if (raw === "" || raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) out[id] = n;
  }
  return out;
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;
  return NextResponse.json(await getInsurers());
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const b = (await request.json()) as { name?: string };
  if (!b.name?.trim()) return NextResponse.json({ error: "Insurer name required" }, { status: 400 });

  const list = await getInsurers();
  if (list.some((i) => i.name.trim().toLowerCase() === b.name!.trim().toLowerCase()))
    return NextResponse.json({ error: "That insurance company already exists" }, { status: 409 });

  const insurer: InsuranceCompany = {
    id: slugId(b.name.trim()),
    name: b.name.trim(),
    active: true,
    rates: {},
    createdAt: new Date().toISOString(),
  };
  list.push(insurer);
  await saveInsurers(list);
  return NextResponse.json(insurer);
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const b = (await request.json()) as {
    id?: string;
    name?: string;
    active?: boolean;
    rates?: Record<string, unknown>;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getInsurers();
  const insurer = list.find((i) => i.id === b.id);
  if (!insurer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.name?.trim()) {
    if (
      list.some(
        (i) => i.id !== insurer.id && i.name.trim().toLowerCase() === b.name!.trim().toLowerCase()
      )
    )
      return NextResponse.json({ error: "That insurance company already exists" }, { status: 409 });
    insurer.name = b.name.trim();
  }
  if (typeof b.active === "boolean") insurer.active = b.active;
  if (b.rates !== undefined) insurer.rates = await cleanRates(b.rates);

  await saveInsurers(list);
  return NextResponse.json(insurer);
}

export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin();
  if (gate.error) return gate.error;

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const list = await getInsurers();
  if (!list.some((i) => i.id === id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await saveInsurers(list.filter((i) => i.id !== id));
  return NextResponse.json({ ok: true });
}
