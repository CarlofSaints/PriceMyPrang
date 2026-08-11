import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listActivity, exportActivity, ACTIVITY_EXPORT_LIMIT } from "@/lib/store";
import { areaLabel } from "@/lib/activityLog";
import type { ActivityFilters, ActivityOutcome, ActorKind } from "@/lib/types";

// The activity log, read-only.
//
// PRICE MY PRANG STAFF ONLY. This shows every workshop's activity alongside
// every other's, so it is gated on view_activity_log, which no panel-beater
// role holds — see lib/permissions.ts. A Site Admin picks it up automatically
// through ALL_PERMISSIONS.
//
// There is NO POST, PATCH or DELETE here, and there never should be. The log is
// append-only; an endpoint that could edit it would defeat the point of keeping
// one.

async function requireViewer() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "view_activity_log"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

const outcomeOf = (v: string | null): ActivityOutcome | undefined =>
  v === "success" || v === "denied" || v === "failed" ? v : undefined;

const actorKindOf = (v: string | null): ActorKind | undefined =>
  v === "user" || v === "consumer" || v === "applicant" || v === "system" ? v : undefined;

function filtersFrom(params: URLSearchParams): ActivityFilters {
  return {
    search: params.get("q")?.trim() || undefined,
    area: params.get("area") || undefined,
    action: params.get("action") || undefined,
    actorId: params.get("actorId") || undefined,
    actorKind: actorKindOf(params.get("actorKind")),
    outcome: outcomeOf(params.get("outcome")),
    panelBeaterId: params.get("panelBeaterId") || undefined,
    entityType: params.get("entityType") || undefined,
    entityId: params.get("entityId") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
  };
}

/** Quote a value for CSV. Excel-safe: everything is quoted, quotes are doubled. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = [
  "When (SAST)",
  "Area",
  "Action",
  "Outcome",
  "Who",
  "Email",
  "Role",
  "Type of user",
  "Workshop",
  "What happened",
  "Record type",
  "Record",
  "Method",
  "Path",
  "Status",
  "IP",
  "Detail",
] as const;

export async function GET(request: Request) {
  const gate = await requireViewer();
  if (gate.error) return gate.error;

  const params = new URL(request.url).searchParams;
  const filters = filtersFrom(params);

  // ---- CSV export -------------------------------------------------------
  // Carl wants to chart this eventually; until there are charts, a spreadsheet
  // of exactly what is on screen is the fastest route to the same answers.
  if (params.get("format") === "csv") {
    const entries = await exportActivity(filters);

    const rows = [
      CSV_COLUMNS.join(","),
      ...entries.map((e) =>
        [
          // Written in SAST, because a South African reading a timestamp in UTC
          // will misread it by two hours every single time.
          new Date(e.createdAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
          areaLabel(e.action),
          e.action,
          e.outcome,
          e.actorName,
          e.actorEmail,
          e.actorRole,
          e.actorKind,
          e.panelBeaterName,
          e.summary,
          e.entityType,
          e.entityLabel ?? e.entityId,
          e.method,
          e.path,
          e.status,
          e.ip,
          e.detail,
        ]
          .map(csvCell)
          .join(",")
      ),
    ].join("\r\n");

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(
      // A BOM, or Excel opens a UTF-8 CSV in the system codepage and mangles
      // every accented name and every “smart quote” in a summary.
      `﻿${rows}`,
      {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="pmp-activity-${stamp}.csv"`,
          // Say so when the cap bit, rather than handing over a short file that
          // looks complete.
          "x-activity-truncated": entries.length >= ACTIVITY_EXPORT_LIMIT ? "true" : "false",
        },
      }
    );
  }

  // ---- JSON page --------------------------------------------------------
  const page = Number(params.get("page")) || 1;
  const pageSize = Number(params.get("pageSize")) || 50;

  return NextResponse.json(await listActivity(filters, page, pageSize));
}
