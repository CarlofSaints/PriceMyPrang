import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRateCards, getRateCard, upsertRateCard, deleteRateCard } from "@/lib/store";
import type { RateCard, RateValues } from "@/lib/types";

/** The workshop this caller may touch: their own, or one a manager names. */
async function resolveTarget(
  user: { panelBeaterId?: string; permissions?: string[] },
  requested?: string
): Promise<{ id: string } | { error: NextResponse }> {
  const canManage = can(user as never, "manage_panel_beaters");
  if (!canManage && !can(user as never, "onboard_self"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const id = canManage ? requested || user.panelBeaterId : user.panelBeaterId;
  if (!id)
    return {
      error: NextResponse.json({ error: "No workshop is linked to your login." }, { status: 400 }),
    };
  // A self-service login is confined to its own listing.
  if (!canManage && id !== user.panelBeaterId)
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { id };
}

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const requested = new URL(request.url).searchParams.get("panelBeaterId") ?? undefined;
  const target = await resolveTarget(user, requested);
  if ("error" in target) return target.error;

  return NextResponse.json(await getRateCards(target.id));
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const b = (await request.json()) as {
    id?: string;
    panelBeaterId?: string;
    kind?: "cash" | "insurance";
    insurerName?: string;
    aluminium?: boolean;
    values?: RateValues;
  };

  const target = await resolveTarget(user, b.panelBeaterId);
  if ("error" in target) return target.error;

  if (b.kind !== "cash" && b.kind !== "insurance")
    return NextResponse.json({ error: "Choose cash or insurance" }, { status: 400 });

  const insurerName = b.insurerName?.trim();
  if (b.kind === "insurance" && !insurerName)
    return NextResponse.json({ error: "Enter the insurance company name" }, { status: 400 });

  const existing = await getRateCards(target.id);

  // One card per insurer, and only one cash card — otherwise picking a rate on
  // a job becomes ambiguous. Names are compared case-insensitively so "Hollard"
  // and "hollard" don't become two cards.
  const clash = existing.find(
    (c) =>
      c.id !== b.id &&
      (b.kind === "cash"
        ? c.kind === "cash"
        : c.insurerName?.toLowerCase() === insurerName?.toLowerCase())
  );
  if (clash)
    return NextResponse.json(
      {
        error:
          b.kind === "cash"
            ? "You already have a cash rate card — edit that one."
            : `You already have a rate card for ${clash.insurerName}.`,
      },
      { status: 409 }
    );

  if (b.id) {
    const current = await getRateCard(b.id);
    if (!current) return NextResponse.json({ error: "Rate card not found" }, { status: 404 });
    if (current.panelBeaterId !== target.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const card: RateCard = {
    id: b.id || crypto.randomUUID(),
    panelBeaterId: target.id,
    kind: b.kind,
    insurerName: b.kind === "insurance" ? insurerName : undefined,
    aluminium: !!b.aluminium,
    values: b.values ?? {},
    createdAt: new Date().toISOString(),
  };

  await upsertRateCard(card);
  return NextResponse.json({ ok: true, card: await getRateCard(card.id) });
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const card = await getRateCard(id);
  if (!card) return NextResponse.json({ error: "Rate card not found" }, { status: 404 });

  const target = await resolveTarget(user, card.panelBeaterId);
  if ("error" in target) return target.error;
  if (card.panelBeaterId !== target.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await deleteRateCard(id);
  return NextResponse.json({ ok: true });
}
