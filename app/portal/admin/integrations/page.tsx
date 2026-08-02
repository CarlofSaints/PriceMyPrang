import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getIntegrationSecretMeta, getIntegrationKey } from "@/lib/store";
import IntegrationKeys from "@/components/IntegrationKeys";

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_integrations")) redirect("/portal");

  const meta = await getIntegrationSecretMeta("imagin8");
  // Only whether it decrypts — never the key itself — crosses to the client.
  const readable = meta ? (await getIntegrationKey("imagin8")) !== null : true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Integrations</h1>
        <p className="text-ink/60">
          API keys for the outside services the platform bills against. Changing or revealing a
          key needs your own password, even though you are already signed in.
        </p>
      </div>
      <IntegrationKeys initial={meta ? { ...meta, readable } : null} />
    </div>
  );
}
