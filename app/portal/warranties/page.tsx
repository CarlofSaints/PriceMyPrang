import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters } from "@/lib/store";
import WarrantyCertificates, { type WarrantyRow } from "@/components/WarrantyCertificates";

export default async function WarrantiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_panel_beaters")) redirect("/portal");

  const panelBeaters = await getPanelBeaters();
  const rows: WarrantyRow[] = panelBeaters.flatMap((pb) =>
    (pb.warranties ?? []).map((w) => ({
      panelBeaterId: pb.id,
      panelBeaterName: pb.tradingAs || pb.companyName,
      manufacturer: w.manufacturer,
      startDate: w.startDate,
      expiryDate: w.expiryDate,
      certificateUrl: w.certificate?.url,
      remind: w.remind,
      remindersSent: w.remindersSent,
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Warranty certificates</h1>
        <p className="text-ink/60">
          Every manufacturer warranty approval captured across panel beaters. View or download each
          certificate, and keep an eye on what&apos;s expiring.
        </p>
      </div>
      <WarrantyCertificates rows={rows} />
    </div>
  );
}
