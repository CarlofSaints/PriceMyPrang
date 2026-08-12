"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// From lib/activityAreas, NOT lib/activityLog — the latter imports Prisma and
// cannot be bundled into a client component.
import { ACTIVITY_AREAS, areaLabel } from "@/lib/activityAreas";
import type {
  ActivityEntry,
  ActivityFacets,
  ActivityOutcome,
  ActivityPage,
  ActivityStats,
  ActorKind,
} from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

// ---------------------------------------------------------------------------
// The activity log viewer. Price my Prang staff only — see the permission gate
// on the page and in /api/admin/activity.
//
// Read-only on purpose: there is no edit or delete control here because there
// is no endpoint behind one. The log is append-only.
// ---------------------------------------------------------------------------

const OUTCOME_STYLE: Record<ActivityOutcome, string> = {
  success: "bg-teal/10 text-teal",
  denied: "bg-coral/15 text-coral",
  failed: "bg-amber/25 text-ink",
};

const OUTCOME_LABEL: Record<ActivityOutcome, string> = {
  success: "Done",
  denied: "Refused",
  failed: "Failed",
};

const ACTOR_LABEL: Record<ActorKind, string> = {
  user: "Signed in",
  consumer: "Customer",
  applicant: "Applicant",
  system: "Automatic",
};

/** Full date and time, in South African time — the log is read by South Africans. */
function whenFull(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Just the clock, for rows under the same date heading. */
function whenTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** yyyy-mm-dd for N days ago, in South African time. */
function dayOffset(days: number): string {
  const now = new Date(Date.now() + 2 * 60 * 60_000);
  now.setUTCDate(now.getUTCDate() - days);
  return now.toISOString().slice(0, 10);
}

interface Filters {
  q: string;
  area: string;
  action: string;
  actorId: string;
  actorKind: string;
  outcome: string;
  panelBeaterId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = {
  q: "",
  area: "",
  action: "",
  actorId: "",
  actorKind: "",
  outcome: "",
  panelBeaterId: "",
  from: "",
  to: "",
};

function toQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  return p.toString();
}

export default function ActivityLog({
  initialPage,
  stats,
  facets,
  workshops,
}: {
  initialPage: ActivityPage;
  stats: ActivityStats;
  facets: ActivityFacets;
  workshops: { id: string; name: string }[];
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [data, setData] = useState<ActivityPage>(initialPage);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // The first render already has server-rendered rows; fetching again on mount
  // would double the work and make the page flicker for no reason.
  const firstRender = useRef(true);

  const query = useMemo(
    () => toQuery(filters, { page: String(page), pageSize: String(data.pageSize) }),
    [filters, page, data.pageSize]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/activity?${query}`);
      if (!res.ok) {
        // Surface what the server said rather than a bare "something went
        // wrong" — a silent failure on a log page is its own small irony.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `The log couldn't be loaded (${res.status}).`);
      }
      setData((await res.json()) as ActivityPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The log couldn't be loaded.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load();
  }, [load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v).length;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const cards: { label: string; value: number; hint: string; accent: string }[] = [
    { label: "Today", value: stats.today, hint: "things done today", accent: "bg-teal" },
    {
      label: "People active today",
      value: stats.activeUsersToday,
      hint: "distinct logins",
      accent: "bg-teal-light",
    },
    { label: "Sign-ins today", value: stats.signInsToday, hint: "successful", accent: "bg-amber" },
    {
      label: "Refused or failed",
      value: stats.problemsToday,
      hint: "today — worth a look",
      accent: "bg-coral",
    },
  ];

  // Group by day so a long list reads as a diary rather than a wall of dates.
  const grouped = useMemo(() => {
    const out: { day: string; entries: ActivityEntry[] }[] = [];
    for (const e of data.entries) {
      const key = dayKey(e.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === key) last.entries.push(e);
      else out.push({ day: key, entries: [e] });
    }
    return out;
  }, [data.entries]);

  return (
    <div className="space-y-6">
      {/* ---- Cards ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="pmp-card overflow-hidden">
            <div className={`h-1 ${c.accent}`} />
            <div className="p-4">
              <p className="font-display text-3xl font-bold text-ink">{c.value}</p>
              <p className="text-sm font-semibold text-ink/80">{c.label}</p>
              <p className="text-xs text-ink/50">{c.hint}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Filters ----
           Every control carries its own label. Stacked dropdowns whose only
           explanation is their default option ("Anyone", "Any outcome") don't
           read as separate filters — the same thing happened on the Dev
           Planner card, where the fix was a label rather than any logic. */}
      <div className="pmp-card space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <input
              className={inputClass}
              placeholder="Name, email, what happened, IP…"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </Field>

          <Field label="Area of the site">
            <select
              className={inputClass}
              value={filters.area}
              onChange={(e) => {
                // Area and action are two views of the same column, so picking
                // an area clears a stale action rather than contradicting it.
                setFilters((f) => ({ ...f, area: e.target.value, action: "" }));
                setPage(1);
              }}
            >
              <option value="">Everything</option>
              {facets.areas.map((a) => (
                <option key={a.area} value={a.area}>
                  {ACTIVITY_AREAS[a.area] ?? a.area} ({a.count})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Who did it">
            <select
              className={inputClass}
              value={filters.actorId}
              onChange={(e) => set("actorId", e.target.value)}
            >
              <option value="">Anyone</option>
              {facets.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="What happened">
            <select
              className={inputClass}
              value={filters.outcome}
              onChange={(e) => set("outcome", e.target.value)}
            >
              <option value="">Any outcome</option>
              <option value="success">Done</option>
              <option value="denied">Refused</option>
              <option value="failed">Failed</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Workshop">
            <select
              className={inputClass}
              value={filters.panelBeaterId}
              onChange={(e) => set("panelBeaterId", e.target.value)}
            >
              <option value="">Any workshop</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type of user">
            <select
              className={inputClass}
              value={filters.actorKind}
              onChange={(e) => set("actorKind", e.target.value)}
            >
              <option value="">Everyone</option>
              <option value="user">Signed-in people</option>
              <option value="consumer">Customers</option>
              <option value="applicant">Applicants</option>
              <option value="system">Automatic jobs</option>
            </select>
          </Field>

          <Field label="From date">
            <input
              type="date"
              className={inputClass}
              value={filters.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </Field>

          <Field label="To date">
            <input
              type="date"
              className={inputClass}
              value={filters.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: "Today", from: dayOffset(0) },
            { label: "Last 7 days", from: dayOffset(6) },
            { label: "Last 30 days", from: dayOffset(29) },
          ].map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setFilters((f) => ({ ...f, from: r.from, to: "" }));
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filters.from === r.from && !filters.to
                  ? "bg-teal text-white"
                  : "bg-ink/5 text-ink/70 hover:bg-teal/10"
              }`}
            >
              {r.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilters(EMPTY);
                  setPage(1);
                }}
                className="rounded-full bg-ink/5 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/10"
              >
                Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </button>
            )}
            {/* A plain link, not fetch + blob: this endpoint is cookie-authed
                and needs no custom header, so the browser's own download does
                the job. */}
            <a
              href={`/api/admin/activity?${toQuery(filters, { format: "csv" })}`}
              className="rounded-full border border-teal/30 bg-white px-4 py-1.5 text-xs font-semibold text-ink hover:bg-teal/5"
            >
              Download CSV
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm text-ink">
          {error}
        </div>
      )}

      {/* ---- Result count ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink/60">
        <p>
          {loading
            ? "Loading…"
            : data.total === 0
              ? "Nothing matches those filters."
              : `${data.total.toLocaleString("en-ZA")} event${data.total === 1 ? "" : "s"}${
                  activeFilters ? " matching" : ""
                } · showing ${data.entries.length}`}
        </p>
        <p className="text-xs">
          {stats.total.toLocaleString("en-ZA")} recorded in total · {stats.last7Days.toLocaleString("en-ZA")} in the last 7 days
        </p>
      </div>

      {/* ---- Rows ---- */}
      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.day} className="space-y-2">
            <p className="sticky top-16 z-10 -mx-1 bg-offwhite/95 px-1 py-1 text-xs font-bold uppercase tracking-[0.15em] text-teal backdrop-blur">
              {group.day}
            </p>

            <div className="pmp-card divide-y divide-ink/5 overflow-hidden">
              {group.entries.map((e) => {
                const open = expanded === e.id;
                return (
                  <div key={e.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : e.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-teal/5"
                    >
                      <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-ink/50">
                        {whenTime(e.createdAt)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{e.summary}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/55">
                          <span className="font-semibold text-ink/70">{areaLabel(e.action)}</span>
                          <span aria-hidden>·</span>
                          <span className="font-mono">{e.action}</span>
                          {e.actorRole && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{e.actorRole}</span>
                            </>
                          )}
                          {e.panelBeaterName && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{e.panelBeaterName}</span>
                            </>
                          )}
                          {e.actorKind !== "user" && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{ACTOR_LABEL[e.actorKind]}</span>
                            </>
                          )}
                        </span>
                      </span>

                      {e.outcome !== "success" && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${OUTCOME_STYLE[e.outcome]}`}
                        >
                          {OUTCOME_LABEL[e.outcome]}
                        </span>
                      )}

                      <span
                        className={`shrink-0 pt-0.5 text-ink/30 transition-transform ${open ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                    </button>

                    {open && (
                      <div className="space-y-3 border-t border-ink/5 bg-offwhite/60 px-4 py-3 text-xs">
                        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                          <Detail label="When">{whenFull(e.createdAt)} (SAST)</Detail>
                          <Detail label="Who">
                            {e.actorName ?? "—"}
                            {e.actorEmail ? ` · ${e.actorEmail}` : ""}
                          </Detail>
                          <Detail label="Type of user">{ACTOR_LABEL[e.actorKind]}</Detail>
                          {e.actorRole && <Detail label="Role">{e.actorRole}</Detail>}
                          {e.panelBeaterName && (
                            <Detail label="Workshop">{e.panelBeaterName}</Detail>
                          )}
                          <Detail label="Outcome">{OUTCOME_LABEL[e.outcome]}</Detail>
                          {e.entityType && (
                            <Detail label="Record">
                              {e.entityType}
                              {e.entityLabel ? ` · ${e.entityLabel}` : ""}
                            </Detail>
                          )}
                          {(e.method || e.path) && (
                            <Detail label="Request">
                              {e.method} {e.path}
                              {e.status ? ` → ${e.status}` : ""}
                            </Detail>
                          )}
                          {e.ip && <Detail label="IP address">{e.ip}</Detail>}
                        </dl>

                        {e.userAgent && (
                          <div>
                            <p className="font-semibold text-ink/70">Browser</p>
                            <p className="break-all text-ink/60">{e.userAgent}</p>
                          </div>
                        )}

                        {e.detail !== undefined && e.detail !== null && (
                          <div>
                            <p className="font-semibold text-ink/70">Everything else</p>
                            <pre className="mt-1 overflow-x-auto rounded-xl bg-white p-3 font-mono text-[11px] leading-relaxed text-ink/80">
                              {JSON.stringify(e.detail, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Paging ---- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Newer
          </Button>
          <p className="text-sm text-ink/60">
            Page {data.page} of {totalPages}
          </p>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-ink/70">{label}</dt>
      <dd className="break-words text-ink/60">{children}</dd>
    </div>
  );
}
