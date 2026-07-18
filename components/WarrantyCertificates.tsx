"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { shortDate } from "@/lib/format";
import { daysUntil } from "@/lib/warrantyReminders";

export interface WarrantyRow {
  panelBeaterId: string;
  panelBeaterName: string;
  manufacturer: string;
  startDate?: string;
  expiryDate?: string;
  certificateUrl?: string;
  remind?: boolean;
  remindersSent?: string[];
}

type StatusKey = "expired" | "expiring" | "valid" | "no-expiry";

function statusFor(expiryDate: string | undefined, now: Date) {
  if (!expiryDate) return { key: "no-expiry" as StatusKey, label: "No expiry set", days: Infinity };
  const days = daysUntil(expiryDate, now);
  if (days < 0) return { key: "expired" as StatusKey, label: `Expired ${Math.abs(days)}d ago`, days };
  if (days <= 30) return { key: "expiring" as StatusKey, label: `Expires in ${days}d`, days };
  return { key: "valid" as StatusKey, label: "Valid", days };
}

const BADGE: Record<StatusKey | "missing", string> = {
  expired: "bg-coral/15 text-coral",
  expiring: "bg-amber/25 text-ink",
  valid: "bg-teal/15 text-teal",
  "no-expiry": "bg-ink/10 text-ink/60",
  missing: "bg-coral/15 text-coral",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expired", label: "Expired" },
  { key: "expiring", label: "Expiring soon" },
  { key: "valid", label: "Valid" },
  { key: "missing", label: "Missing certificate" },
];

export default function WarrantyCertificates({ rows }: { rows: WarrantyRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const now = useMemo(() => new Date(), []);

  const enriched = useMemo(
    () =>
      rows
        .map((r) => ({ ...r, status: statusFor(r.expiryDate, now), hasCert: !!r.certificateUrl }))
        .sort((a, b) => a.status.days - b.status.days),
    [rows, now]
  );

  const counts = useMemo(() => {
    const c = { expired: 0, expiring: 0, valid: 0, missing: 0 };
    for (const r of enriched) {
      if (!r.hasCert) c.missing++;
      if (r.status.key === "expired") c.expired++;
      else if (r.status.key === "expiring") c.expiring++;
      else if (r.status.key === "valid") c.valid++;
    }
    return c;
  }, [enriched]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter((r) => {
      if (q && !`${r.panelBeaterName} ${r.manufacturer}`.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "missing") return !r.hasCert;
      return r.status.key === filter;
    });
  }, [enriched, query, filter]);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
        No warranty certificates yet. They&apos;re captured when a panel beater adds a manufacturer
        warranty approval on their listing.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Expired" value={counts.expired} tone="coral" />
        <SummaryCard label="Expiring ≤30d" value={counts.expiring} tone="amber" />
        <SummaryCard label="Valid" value={counts.valid} tone="teal" />
        <SummaryCard label="Missing cert" value={counts.missing} tone="coral" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-[220px] flex-1 rounded-xl border border-teal/20 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-teal focus:outline-none"
          placeholder="Search panel beater or manufacturer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.key ? "bg-teal text-white" : "bg-white text-ink/70 hover:bg-teal/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="pmp-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink/5 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
                <th className="px-4 py-3">Panel beater</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Certificate</th>
                <th className="px-4 py-3">Reminders</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {visible.map((r, i) => (
                <tr key={`${r.panelBeaterId}-${r.manufacturer}-${i}`} className="hover:bg-teal/5">
                  <td className="px-4 py-3 font-semibold text-ink">{r.panelBeaterName}</td>
                  <td className="px-4 py-3">{r.manufacturer}</td>
                  <td className="px-4 py-3 text-ink/70">{r.startDate ? shortDate(r.startDate) : "—"}</td>
                  <td className="px-4 py-3 text-ink/70">{r.expiryDate ? shortDate(r.expiryDate) : "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                        BADGE[r.status.key]
                      }`}
                    >
                      {r.status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.certificateUrl ? (
                      <a
                        href={r.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-teal hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE.missing}`}>
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/60">
                    {r.remind ? (r.remindersSent?.length ? `${r.remindersSent.length} sent` : "On") : "Off"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/portal/panel-beaters/${r.panelBeaterId}`}
                      className="font-semibold text-teal hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink/50">
                    No certificates match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "coral" | "amber" | "teal";
}) {
  const ring =
    tone === "coral" ? "border-coral/30" : tone === "amber" ? "border-amber/40" : "border-teal/25";
  const text = tone === "coral" ? "text-coral" : tone === "amber" ? "text-ink" : "text-teal";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${ring}`}>
      <p className={`font-display text-2xl font-bold ${text}`}>{value}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}
