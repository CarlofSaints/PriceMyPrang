import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  findRequestIdByReference,
  listAdditionals,
  upsertAdditional,
  setAdditionalStatus,
  deleteAdditional,
} from "@/lib/store";
import { computeQuoteTotals } from "@/lib/quoteTotals";
import { actingWorkshop } from "@/lib/additionalsAccess";
import type { AdditionalStatus, QuoteLineItem } from "@/lib/types";

/**
 * Additionals — extra work found after a vehicle is stripped.
 *
 * Everything here is scoped to ONE workshop's own additionals on a job. A
 * repairer must never see what a competitor found on the same vehicle, which
 * is the same rule the quotes already follow.
 */

const FORBIDDEN = NextResponse.json({ error: "Forbidden" }, { status: 403 });
const NOT_FOUND = NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_additionals")) return FORBIDDEN;

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const requestId = await findRequestIdByReference(reference);
  if (!requestId) return NOT_FOUND;

  const workshop = actingWorkshop(user, url.searchParams.get("panelBeaterId") ?? undefined);
  // Staff with no workshop named see every workshop's additionals on the job;
  // a repairer login can only ever be handed its own.
  return NextResponse.json(await listAdditionals(requestId, workshop ?? undefined));
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_additionals")) return FORBIDDEN;

  const b = (await request.json()) as {
    id?: string;
    reference?: string;
    panelBeaterId?: string;
    reason?: string;
    claimNumber?: string;
    lines?: QuoteLineItem[];
  };
  if (!b.reference) return NextResponse.json({ error: "reference required" }, { status: 400 });

  const workshop = actingWorkshop(user, b.panelBeaterId);
  if (!workshop)
    return NextResponse.json(
      { error: "Choose which workshop this is for." },
      { status: 400 }
    );

  const requestId = await findRequestIdByReference(b.reference);
  if (!requestId) return NOT_FOUND;

  const lines = (b.lines ?? []).filter((l) => l.description?.trim());
  if (!lines.length)
    return NextResponse.json(
      { error: "Add at least one item before saving." },
      { status: 400 }
    );

  // Totals are computed HERE, never taken from the client. The insurer is being
  // asked to approve a number, and a number the browser supplied is a number
  // anyone can edit.
  const t = computeQuoteTotals({
    lines,
    sundriesValue: 0,
    sundriesMode: "rand",
    consumables: 0,
  });

  const saved = await upsertAdditional({
    id: b.id,
    requestId,
    panelBeaterId: workshop,
    reason: b.reason,
    claimNumber: b.claimNumber,
    lines,
    totals: {
      partsTotal: t.partsTotal,
      outWorkTotal: t.outWorkTotal,
      panelTotal: t.panelTotal,
      paintTotal: t.paintTotal,
      stripTotal: t.stripTotal,
      labourTotal: t.labourTotal,
      totalHours: t.totalHours,
      subtotal: t.subtotal,
      vat: t.vat,
      total: t.total,
    },
    createdByName: user.name,
  });

  if ("error" in saved) {
    if (saved.error === "already_sent")
      return NextResponse.json(
        {
          error:
            "This request has already gone to the insurer and can't be changed. Raise a new one for anything further.",
        },
        { status: 409 }
      );
    return NOT_FOUND;
  }

  return NextResponse.json(saved);
}

/** Record what the insurer said. */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_additionals")) return FORBIDDEN;

  const b = (await request.json()) as {
    id?: string;
    panelBeaterId?: string;
    status?: AdditionalStatus;
    responseNote?: string;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!b.status || !["pending", "approved", "declined"].includes(b.status))
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });

  const workshop = actingWorkshop(user, b.panelBeaterId);
  if (!workshop) return NextResponse.json({ error: "Choose a workshop." }, { status: 400 });

  const updated = await setAdditionalStatus(b.id, workshop, b.status, b.responseNote);
  if (!updated) return NOT_FOUND;
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_additionals")) return FORBIDDEN;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const workshop = actingWorkshop(user, url.searchParams.get("panelBeaterId") ?? undefined);
  if (!workshop) return NextResponse.json({ error: "Choose a workshop." }, { status: 400 });

  const result = await deleteAdditional(id, workshop);
  if ("error" in result) {
    if (result.error === "already_sent")
      return NextResponse.json(
        {
          error:
            "This has already been sent to the insurer. It stays on the job as a record of what was asked.",
        },
        { status: 409 }
      );
    return NOT_FOUND;
  }
  return NextResponse.json({ ok: true });
}

