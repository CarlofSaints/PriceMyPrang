import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getAllRequests } from "@/lib/store";
import { zar, shortDate } from "@/lib/format";
import { Button } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  completed: "Completed",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "view_dashboard")) redirect("/portal/panel-beaters");

  const requests = await getAllRequests();

  const total = requests.length;
  const inProgress = requests.filter((r) => r.status === "in_progress").length;
  const completed = requests.filter((r) => r.status === "completed").length;
  const totalExecuted = requests
    .flatMap((r) => r.quotes)
    .reduce((sum, q) => sum + (q.total || 0), 0);

  const cards = [
    { label: "Total requests", value: String(total), accent: "bg-teal" },
    { label: "In progress", value: String(inProgress), accent: "bg-amber" },
    { label: "Completed", value: String(completed), accent: "bg-teal-light" },
    { label: "Total executed", value: zar(totalExecuted), accent: "bg-coral" },
  ];

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
              {requests.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-ink/50">
                    No quote requests yet.
                  </td>
                </tr>
              )}
              {requests.map((r) => (
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
                  <td className="px-4 py-3">{r.vehicle.make || "—"}</td>
                  <td className="px-4 py-3">{r.vehicle.model || "—"}</td>
                  <td className="px-4 py-3">{r.vehicle.year || "—"}</td>
                  <td className="px-4 py-3">{r.vehicle.colour || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {r.quotes.length}/{r.quotesRequested}
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
      </div>
    </div>
  );
}
