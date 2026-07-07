import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeater } from "@/lib/store";
import PanelBeaterForm from "@/components/PanelBeaterForm";

export default async function EditPanelBeaterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self")) redirect("/portal");

  const { id } = await params;
  const pb = await getPanelBeater(id);
  if (!pb) notFound();
  if (!canManage && user.panelBeaterId !== pb.id) redirect("/portal/panel-beaters");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/portal/panel-beaters" className="text-sm text-teal hover:underline">
          ← Panel beaters
        </Link>
        <h1 className="font-display text-3xl font-bold text-ink">
          {pb.tradingAs || pb.companyName}
        </h1>
      </div>
      <div className="pmp-card">
        <PanelBeaterForm existing={pb} />
      </div>
    </div>
  );
}
