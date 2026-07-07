import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import PanelBeaterForm from "@/components/PanelBeaterForm";

export default async function NewPanelBeaterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_panel_beaters") && !can(user, "onboard_self")) redirect("/portal");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/portal/panel-beaters" className="text-sm text-teal hover:underline">
          ← Panel beaters
        </Link>
        <h1 className="font-display text-3xl font-bold text-ink">Onboard a panel beater</h1>
      </div>
      <div className="pmp-card">
        <PanelBeaterForm />
      </div>
    </div>
  );
}
