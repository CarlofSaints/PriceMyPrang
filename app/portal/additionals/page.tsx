import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  listPanelBeaterWork,
  getRequest,
  getInsurersWithContacts,
  getPanelBeater,
} from "@/lib/store";
import AdditionalsManager, { type JobOption } from "@/components/AdditionalsManager";

/**
 * Extra work found after stripping a vehicle.
 *
 * Lives on its own page rather than on the request detail page, because that
 * one is gated on `view_dashboard` — which panel-beater roles deliberately
 * don't hold. This is the repairer's own view of their own jobs.
 */
export default async function AdditionalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_additionals")) redirect("/portal");

  // A workshop is required, not just the permission: a Site Admin holds it via
  // ALL_PERMISSIONS but has no jobs of their own to raise additionals against.
  const workshopId = user.panelBeaterId;
  if (!workshopId) redirect("/portal");

  const [work, insurers, workshop] = await Promise.all([
    listPanelBeaterWork(workshopId, { pageSize: 100 }),
    getInsurersWithContacts(workshopId),
    getPanelBeater(workshopId),
  ]);

  // The work list is a summary; the claim number and insurer live on the full
  // request, so pull those in for the jobs on screen.
  const jobs: JobOption[] = await Promise.all(
    work.rows.map(async (r): Promise<JobOption> => {
      const full = await getRequest(r.reference);
      return {
        reference: r.reference,
        clientName: r.clientName,
        vehicle: r.vehicle,
        registration: r.registration,
        isInsuranceClaim: r.isInsuranceClaim,
        claimNumber: full?.claimNumber,
        insurerName: full?.insurerName,
        insurerId: full?.insurerId,
      };
    })
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Additionals</h1>
        <p className="text-ink/60">
          Extra work you found once the vehicle was stripped. Price it, send it to the
          insurer for approval, and the client is told the repair is waiting on them.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="pmp-card">
          <p className="text-sm text-ink/60">
            No jobs have come to {workshop ? workshop.tradingAs || workshop.companyName : "you"}{" "}
            yet. Additionals are raised against a job, so there is nothing to add to.
          </p>
        </div>
      ) : (
        <AdditionalsManager jobs={jobs} insurers={insurers} panelBeaterId={workshopId} />
      )}
    </div>
  );
}
