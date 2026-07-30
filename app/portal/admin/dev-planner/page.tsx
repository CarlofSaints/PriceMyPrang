import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listDevTickets, getDevTicketStats } from "@/lib/store";
import DevPlanner from "@/components/DevPlanner";

export default async function DevPlannerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_dev_tickets")) redirect("/portal");

  const [tickets, stats] = await Promise.all([listDevTickets(), getDevTicketStats()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Dev planner</h1>
        <p className="text-ink/60">
          The development pipeline — what needs building, how badly it&apos;s wanted, and when to
          be reminded. Only Super Admins can see this.
        </p>
      </div>
      <DevPlanner initialTickets={tickets} initialStats={stats} />
    </div>
  );
}
