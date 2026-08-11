import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listActivity,
  getActivityStats,
  getActivityFacets,
  getPanelBeaters,
} from "@/lib/store";
import ActivityLog from "@/components/ActivityLog";

// The site-wide activity log.
//
// PRICE MY PRANG STAFF ONLY. It shows every workshop's activity next to every
// other's, so `view_activity_log` is deliberately held by no panel-beater role;
// a Site Admin gets it through ALL_PERMISSIONS. The API behind the page repeats
// the same check — a page guard is not a guard on the data.
export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "view_activity_log")) redirect("/portal");

  const [page, stats, facets, panelBeaters] = await Promise.all([
    listActivity({}, 1, 50),
    getActivityStats(),
    getActivityFacets(),
    getPanelBeaters(),
  ]);

  const workshops = panelBeaters
    .map((p) => ({ id: p.id, name: p.tradingAs || p.companyName }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Activity log</h1>
        <p className="text-ink/60">
          Everything that happens on the site — who signed in, which forms were filled in, which
          quotes were built, what was changed, and what was refused. Only Super Admins can see
          this.
        </p>
      </div>
      <ActivityLog
        initialPage={page}
        stats={stats}
        facets={facets}
        workshops={workshops}
      />
    </div>
  );
}
