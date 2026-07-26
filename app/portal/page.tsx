import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listRequests, getDashboardStats } from "@/lib/store";
import { zar, shortDate } from "@/lib/format";
import { Button } from "@/components/ui";
import type { RequestStatus } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  completed: "Completed",
};

const PAGE_SIZE = 50;
const STATUSES: RequestStatus[] = ["new", "in_progress", "completed"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "view_dashboard")) redirect("/portal/panel-beaters");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as RequestStatus)
    ? (sp.status as RequestStatus)
    : undefined;
  const search = sp.q?.trim() || undefined;

  // Counts and totals are computed in the database, and only one page of rows
  // is fetched — the dashboard no longer depends on the size of the table.
  const [stats, { rows, total }] = await Promise.all([
    getDashboardStats(),
    listRequests({ page, pageSize: PAGE_SIZE, status, search }),
  ]);

  const cards = [
    { label: "Total requests", value: String(stats.total), accent: "bg-teal" },
    { label: "In progress", value: String(stats.inProgress), accent: "bg-amber" },
    { label: "Completed", value: String(stats.completed), accent: "bg-teal-light" },
    { label: "Total executed", value: zar(stats.totalExecuted), accent: "bg-coral" },
  ];

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, q: search, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && !(k === "page" && v === 1)) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `/portal?${s}` : "/portal";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink/60">Incoming quote requests and their status.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" action="/portal" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Reference, name, email or reg…"
            className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline" size="md">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Link href={qs({ status: undefined, page: 1 })}>
            <Button variant={status ? "outline" : "primary"} size="md">
              All
            </Button>
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={qs({ status: s, page: 1 })}>
              <Button variant={status === s ? "primary" : "outline"} size="md">
                {STATUS_LABEL[s]}
              </Button>
            </Link>
          ))}
        </div>

        {(search || status) && (
          <Link href="/portal" className="text-sm text-teal underline">
            Clear filters
          </Link>
        )}
      </div>

      <div className="pmp-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Make</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Colour</th>
                <th className="px-4 py-3 text-center">Quotes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-ink/50">
                    {search || status
                      ? "No requests match those filters."
                      : "No quote requests yet."}
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
                  <td className="px-4 py-3">
                    {r.firstName} {r.lastName}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{r.email}</td>
                  <td className="px-4 py-3">{r.make || "—"}</td>
                  <td className="px-4 py-3">{r.model || "—"}</td>
                  <td className="px-4 py-3">{r.year || "—"}</td>
                  <td className="px-4 py-3">{r.colour || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {r.quoteCount}/{r.quotesRequested}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink/70">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/portal/requests/${r.reference}`}>
                        <Button variant="outline" size="md">
                          View
                        </Button>
                      </Link>
                      {can(user, "build_quotes") && (
                        <Link href={`/portal/quote-builder?ref=${r.reference}`}>
                          <Button size="md">Build quotation</Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-ink/5 px-4 py-3 text-sm text-ink/60">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
              {total}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link href={qs({ page: page - 1 })}>
                  <Button variant="outline" size="md">
                    Previous
                  </Button>
                </Link>
              )}
              <span>
                Page {page} of {pageCount}
              </span>
              {page < pageCount && (
                <Link href={qs({ page: page + 1 })}>
                  <Button variant="outline" size="md">
                    Next
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
