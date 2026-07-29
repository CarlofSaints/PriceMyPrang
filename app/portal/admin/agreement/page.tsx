import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAgreementDocuments } from "@/lib/store";
import AgreementManager from "@/components/AgreementManager";

export default async function AgreementAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The agreement binds the whole network, so it sits with panel-beater
  // management rather than being its own permission.
  if (!can(user, "manage_panel_beaters")) redirect("/portal");

  const documents = await listAgreementDocuments();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Repairer agreement</h1>
        <p className="text-ink/60">
          The Terms &amp; Conditions, disclaimers, NDA and SLA every repairer signs. New
          registrations are emailed a link to read and sign the current version.
        </p>
      </div>
      <AgreementManager initial={documents} />
    </div>
  );
}
