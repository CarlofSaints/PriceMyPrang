import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listComplaints, getPanelBeaters, ratingSummaryFor } from "@/lib/store";
import ComplaintsGrid from "@/components/ComplaintsGrid";
import { RatingStars } from "@/components/RatingStars";

// Every complaint across the network, plus each workshop's standing.
export default async function AllComplaintsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_complaints")) redirect("/portal");

  const [complaints, panelBeaters] = await Promise.all([listComplaints(), getPanelBeaters()]);

  // Rating and complaint count per workshop, so a pattern is visible at a
  // glance rather than only in a list of individual grievances.
  const standings = (
    await Promise.all(
      panelBeaters.map(async (pb) => ({
        id: pb.id,
        name: pb.tradingAs || pb.companyName,
        summary: await ratingSummaryFor(pb.id),
        open: complaints.filter(
          (c) => c.panelBeaterId === pb.id && c.status !== "resolved" && c.status !== "closed"
        ).length,
        total: complaints.filter((c) => c.panelBeaterId === pb.id).length,
      }))
    )
  ).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Complaints</h1>
        <p className="text-ink/60">
          Every complaint across the network. Never shown publicly — ratings and their comments
          are, complaints are not.
        </p>
      </div>

      <div className="pmp-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink/5 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
                <th className="px-4 py-3">Workshop</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Open</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {standings.map((s) => (
                <tr key={s.id} className="hover:bg-teal/5">
                  <td className="px-4 py-3 font-semibold text-ink">{s.name}</td>
                  <td className="px-4 py-3">
                    {s.summary.count === 0 ? (
                      <span className="text-xs text-ink/40">no ratings yet</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RatingStars summary={s.summary} size="sm" />
                        <span className="text-xs text-ink/60">
                          {s.summary.average.toFixed(1)} ({s.summary.count})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.open > 0 ? (
                      <span className="rounded-full bg-coral/15 px-2 py-0.5 text-xs font-semibold text-coral">
                        {s.open}
                      </span>
                    ) : (
                      <span className="text-xs text-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/60">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ComplaintsGrid initial={complaints} canManageAll />
    </div>
  );
}
