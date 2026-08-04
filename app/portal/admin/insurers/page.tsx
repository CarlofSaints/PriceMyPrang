import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInsurers, listSuggestedInsurers } from "@/lib/store";
import InsurersManager from "@/components/InsurersManager";
import InsurerContacts from "@/components/InsurerContacts";

export default async function InsurersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_insurers")) redirect("/portal");

  const [insurers, suggestions] = await Promise.all([getInsurers(), listSuggestedInsurers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Insurance companies</h1>
        <p className="text-ink/60">
          Add insurers and set each one&apos;s rate card. These rates are shared — every panel
          beater can see and use them, and consumers pick their insurer when requesting a quote.
        </p>
      </div>
      <InsurersManager initial={insurers} suggestions={suggestions} />

      <div className="pmp-card space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Contacts</h2>
          <p className="text-sm text-ink/60">
            Who to send additionals to. These are SHARED — every workshop sees them and can
            use them as a starting point. A workshop that deals with a particular handler
            adds that person as their own private contact, which nobody else sees.
          </p>
        </div>
        <InsurerContacts insurers={insurers} mode="generic" />
      </div>
    </div>
  );
}
