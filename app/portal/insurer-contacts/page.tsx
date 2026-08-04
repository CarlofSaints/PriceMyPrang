import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInsurersWithContacts } from "@/lib/store";
import InsurerContacts from "@/components/InsurerContacts";

/**
 * A workshop's own address book at each insurer.
 *
 * The shared contacts PMP maintains show here read-only, so a repairer can see
 * what they already have before adding their own. Anything they add is private
 * to them — who they know at an insurer is their own commercial relationship.
 */
export default async function InsurerContactsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_additionals")) redirect("/portal");

  const workshopId = user.panelBeaterId;
  if (!workshopId) redirect("/portal");

  const insurers = await getInsurersWithContacts(workshopId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Insurer contacts</h1>
        <p className="text-ink/60">
          Who you send additionals to. The ones marked <strong>shared</strong> come from Price
          my Prang and everyone has them. Add your own handler at an insurer and it stays
          private to your workshop.
        </p>
      </div>
      <div className="pmp-card">
        <InsurerContacts insurers={insurers} mode="own" />
      </div>
    </div>
  );
}
