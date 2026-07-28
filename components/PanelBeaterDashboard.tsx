import Link from "next/link";
import { zar, shortDate } from "@/lib/format";
import { Button } from "@/components/ui";
import type { PanelBeaterQuoteStats, PanelBeaterWorkRow } from "@/lib/store";

const REQUEST_STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  completed: "Completed",
};

/** How this workshop's own quote is doing with the consumer. */
function QuoteProgress({ row }: { row: PanelBeaterWorkRow }) {
  if (!row.quoteStatus)
    return (
      <span className="rounded-full bg-amber/30 px-2.5 py-1 text-xs font-semibold text-ink">
        Not quoted
      </span>
    );

  const styles: Record<string, string> = {
    awaiting_approval: "bg-ink/5 text-ink/70",
    accepted: "bg-teal/15 text-teal",
    declined: "bg-coral/15 text-coral",
  };
  const labels: Record<string, string> = {
    awaiting_approval: "Awaiting approval",
    accepted: "Approved",
    declined: "Not selected",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[row.quoteStatus] ?? ""}`}
    >
      {labels[row.quoteStatus] ?? row.quoteStatus}
    </span>
  );
}

export default function PanelBeaterDashboard({
  workshopName,
  stats,
  rows,
}: {
  workshopName: string;
  stats: PanelBeaterQuoteStats;
  rows: PanelBeaterWorkRow[];
}) {
  const cards = [
    { label: "Total quotes", value: String(stats.totalQuotes), accent: "bg-teal" },
    { label: "Awaiting approval", value: String(stats.awaitingApproval), accent: "bg-amber" },
    { label: "Approved", value: String(stats.accepted), accent: "bg-teal-light" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink/60">Work sent to {workshopName}, and how your quotes are doing.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="pmp-card overflow-hidden p-0">
            <div className={`h-1.5 ${c.accent}`} />
            <div className="p-5">
              <p className="text-sm text-ink/60">{c.label}</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="pmp-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Registration</th>
                <th className="px-4 py-3">Claim</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3 text-right">Your quote</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-ink/50">
                    No work has been sent to you yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.reference} className="hover:bg-teal/5">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-teal">
                    {r.reference}
                    <div className="text-[10px] font-normal text-ink/40">
                      {shortDate(r.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.clientName}</td>
                  <td className="px-4 py-3">{r.vehicle || "—"}</td>
                  <td className="px-4 py-3">{r.registration || "—"}</td>
                  <td className="px-4 py-3">{r.isInsuranceClaim ? "Insurance" : "Private"}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {REQUEST_STATUS_LABEL[r.requestStatus] ?? r.requestStatus}
                  </td>
                  <td className="px-4 py-3">
                    <QuoteProgress row={r} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.quoteTotal != null ? zar(r.quoteTotal) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/portal/requests/${r.reference}`}>
                        <Button variant="outline" size="md">
                          View
                        </Button>
                      </Link>
                      <Link href={`/portal/quote-builder?ref=${r.reference}`}>
                        <Button size="md">{r.quoteStatus ? "Edit quote" : "Quote"}</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
