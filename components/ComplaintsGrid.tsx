"use client";

import { Fragment, useMemo, useState } from "react";
import { shortDate } from "@/lib/format";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABEL,
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_OUTCOME_LABEL,
  VEHICLE_SAFETY_LABEL,
  type Complaint,
  type ComplaintStatus,
} from "@/lib/types";
import { Button, inputClass } from "./ui";

export default function ComplaintsGrid({
  initial,
  canManageAll,
}: {
  initial: Complaint[];
  /** True for PMP staff: shows the workshop column and internal notes. */
  canManageAll: boolean;
}) {
  const [complaints, setComplaints] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return complaints.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (
        q &&
        !`${c.reference ?? ""} ${c.panelBeaterName ?? ""} ${c.description}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [complaints, statusFilter, search]);

  const openCount = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed")
    .length;
  const unsafeCount = complaints.filter(
    (c) => c.vehicleSafety === "unsafe" && c.status !== "resolved" && c.status !== "closed"
  ).length;

  async function setStatus(c: Complaint, status: ComplaintStatus) {
    const prev = complaints;
    setComplaints((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)));
    setError(null);
    try {
      const res = await fetch("/api/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not update");
      const updated = (await res.json()) as Complaint;
      setComplaints((l) => l.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setComplaints(prev);
      setError((err as Error).message);
    }
  }

  async function addNote(c: Complaint) {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, body: note, internal }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save the note");
      const updated = (await res.json()) as Complaint;
      setComplaints((l) => l.map((x) => (x.id === updated.id ? updated : x)));
      setNote("");
      setInternal(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {unsafeCount > 0 && (
        <div className="rounded-2xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">
            {unsafeCount} open {unsafeCount === 1 ? "complaint says" : "complaints say"} the
            vehicle isn&apos;t safe to drive.
          </strong>{" "}
          Deal with these first.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, workshop, text…"
          className="w-72 rounded-lg border border-ink/15 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={statusFilter === "all" ? "primary" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All ({complaints.length})
          </Button>
          {COMPLAINT_STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "primary" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {COMPLAINT_STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
        <span className="ml-auto text-sm text-ink/50">{openCount} open</span>
      </div>

      {visible.length === 0 ? (
        <div className="pmp-card p-10 text-center text-ink/50">
          {complaints.length === 0
            ? "No complaints. Long may it last."
            : "None match those filters."}
        </div>
      ) : (
        <div className="pmp-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ink/5 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
                  <th className="px-4 py-3">Logged</th>
                  <th className="px-4 py-3">Reference</th>
                  {canManageAll && <th className="px-4 py-3">Workshop</th>}
                  <th className="px-4 py-3">About</th>
                  <th className="px-4 py-3">Safe?</th>
                  <th className="px-4 py-3">Wants</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {visible.map((c) => (
                  // The KEY belongs on the Fragment: it is the list item here,
                  // and a bare <> cannot carry one.
                  <Fragment key={c.id}>
                    <tr className="align-top hover:bg-teal/5">
                      <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                        {shortDate(c.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {c.reference ?? "—"}
                      </td>
                      {canManageAll && (
                        <td className="px-4 py-3 font-semibold">{c.panelBeaterName ?? "—"}</td>
                      )}
                      <td className="px-4 py-3">{COMPLAINT_CATEGORY_LABEL[c.category]}</td>
                      <td className="px-4 py-3">
                        {c.vehicleSafety === "unsafe" ? (
                          <span className="rounded-full bg-coral/15 px-2 py-0.5 text-xs font-semibold text-coral">
                            Not safe
                          </span>
                        ) : (
                          <span className="text-xs text-ink/50">
                            {c.vehicleSafety ? VEHICLE_SAFETY_LABEL[c.vehicleSafety] : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink/70">
                        {c.desiredOutcome ? COMPLAINT_OUTCOME_LABEL[c.desiredOutcome] : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-lg border border-ink/15 px-2 py-1 text-xs"
                          value={c.status}
                          onChange={(e) => setStatus(c, e.target.value as ComplaintStatus)}
                        >
                          {COMPLAINT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {COMPLAINT_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-sm text-teal underline"
                          onClick={() => {
                            setOpenId(openId === c.id ? null : c.id);
                            setNote("");
                          }}
                        >
                          {openId === c.id ? "Close" : "Open"}
                        </button>
                      </td>
                    </tr>

                    {openId === c.id && (
                      <tr className="bg-offwhite/60">
                        <td colSpan={canManageAll ? 8 : 7} className="px-4 py-4">
                          <div className="space-y-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                                What they said
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">
                                {c.description}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink/60">
                              {c.collectedOn && <span>Collected {shortDate(c.collectedOn)}</span>}
                              {c.problemNoticedOn && (
                                <span>Noticed {shortDate(c.problemNoticedOn)}</span>
                              )}
                              {c.stillWithRepairer !== undefined && (
                                <span>
                                  {c.stillWithRepairer
                                    ? "Car still with the repairer"
                                    : "Car collected"}
                                </span>
                              )}
                              {c.raisedWithRepairer !== undefined && (
                                <span>
                                  {c.raisedWithRepairer
                                    ? "Already raised with the repairer"
                                    : "Not yet raised with the repairer"}
                                </span>
                              )}
                            </div>

                            {c.media.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                                  Attached ({c.media.length})
                                </p>
                                <ul className="mt-1 flex flex-wrap gap-2">
                                  {c.media.map((m, i) => (
                                    <li key={m.id}>
                                      <a
                                        href={m.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg bg-ink/5 px-3 py-1.5 text-xs text-teal underline"
                                      >
                                        {m.isVideo ? "Video" : `Photo ${i + 1}`}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                                How it was dealt with
                              </p>
                              {c.notes.length === 0 ? (
                                <p className="mt-1 text-sm text-ink/50">Nothing recorded yet.</p>
                              ) : (
                                <ul className="mt-2 space-y-2">
                                  {c.notes.map((n) => (
                                    <li
                                      key={n.id}
                                      className={`rounded-lg px-3 py-2 ${
                                        n.internal ? "bg-amber/10" : "bg-white"
                                      }`}
                                    >
                                      <p className="whitespace-pre-wrap text-sm text-ink/80">
                                        {n.body}
                                      </p>
                                      <p className="mt-1 text-xs text-ink/45">
                                        {n.authorName} · {shortDate(n.createdAt)}
                                        {n.internal && (
                                          <span className="ml-2 font-semibold text-ink/60">
                                            internal — not shown to the repairer
                                          </span>
                                        )}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <div className="mt-3 space-y-2">
                                <textarea
                                  className={`${inputClass} min-h-20`}
                                  placeholder="What was done about this?"
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                />
                                <div className="flex items-center gap-3">
                                  <Button
                                    type="button"
                                    disabled={busy || !note.trim()}
                                    onClick={() => addNote(c)}
                                  >
                                    {busy ? "Saving…" : "Add note"}
                                  </Button>
                                  {canManageAll && (
                                    <label className="flex items-center gap-2 text-sm text-ink/70">
                                      <input
                                        type="checkbox"
                                        checked={internal}
                                        onChange={(e) => setInternal(e.target.checked)}
                                        className="h-4 w-4 accent-[#00848d]"
                                      />
                                      Internal only — the repairer won&apos;t see this
                                    </label>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
