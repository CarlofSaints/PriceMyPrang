import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getCustomRateTypes,
  createCustomRateType,
  deleteCustomRateType,
} from "@/lib/store";
import { resolveRateTarget } from "@/lib/rateAccess";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import type { RateUnit } from "@/lib/types";

/**
 * A workshop's own custom rates — the ones they invent on top of the fixed
 * catalogue. Defined here; priced per card through /api/rate-cards.
 *
 * Same ownership check as the cards themselves (resolveRateTarget), because
 * these two endpoints reach the same rows in rate_card_values.
 */

const UNITS: RateUnit[] = ["rand_per_hour", "rand", "percent"];

/** Long enough for "Diamond cut rim repair — oversize", short of an essay. */
const MAX_LABEL = 60;

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const requested = new URL(request.url).searchParams.get("panelBeaterId") ?? undefined;
  const target = await resolveRateTarget(user, requested);
  if ("error" in target) return target.error;

  return NextResponse.json(await getCustomRateTypes(target.id));
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const b = (await request.json()) as {
    panelBeaterId?: string;
    label?: string;
    unit?: RateUnit;
  };

  const target = await resolveRateTarget(user, b.panelBeaterId);
  if ("error" in target) return target.error;

  const label = b.label?.trim();
  if (!label) return NextResponse.json({ error: "Give the rate a name" }, { status: 400 });
  if (label.length > MAX_LABEL)
    return NextResponse.json(
      { error: `Keep the name under ${MAX_LABEL} characters` },
      { status: 400 }
    );
  if (!b.unit || !UNITS.includes(b.unit))
    return NextResponse.json(
      { error: "Choose per hour, fixed price, or a percentage" },
      { status: 400 }
    );

  const created = await createCustomRateType(target.id, label, b.unit);
  // Null means the name is taken. 409 rather than 400 — nothing about the
  // request was malformed, it just collides with what's already there.
  if (!created)
    return NextResponse.json(
      { error: `You already have a rate called “${label}”.` },
      { status: 409 }
    );

  await logActivity({
    action: "rate.custom_type.create",
    summary: `${user.name} added the custom rate “${label}”`,
    entityType: "custom_rate_type",
    entityId: created.id,
    entityLabel: label,
    ...actorFromUser(user),
    panelBeaterId: target.id,
    detail: { unit: b.unit },
    request,
  });

  return NextResponse.json(created);
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const target = await resolveRateTarget(user, url.searchParams.get("panelBeaterId") ?? undefined);
  if ("error" in target) return target.error;

  // Removes the values set against it on every one of this workshop's cards.
  // Another workshop's rate is a 404, not a 403 — same as everywhere else here,
  // so an id can't be used to discover what exists.
  // Read the label BEFORE deleting, so the log names the rate rather than an
  // opaque uuid nobody can look up afterwards.
  const existing = (await getCustomRateTypes(target.id)).find((c) => c.id === id);
  const ok = await deleteCustomRateType(target.id, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({
    action: "rate.custom_type.delete",
    summary: `${user.name} deleted the custom rate “${existing?.label ?? id}” and its values on every card`,
    entityType: "custom_rate_type",
    entityId: id,
    entityLabel: existing?.label,
    ...actorFromUser(user),
    panelBeaterId: target.id,
    detail: { unit: existing?.unit },
    request,
  });

  return NextResponse.json({ ok: true });
}
