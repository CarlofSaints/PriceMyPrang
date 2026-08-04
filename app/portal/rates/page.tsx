import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getPanelBeaters,
  getPanelBeater,
  getInsurers,
  getRateCards,
  getCustomRateTypes,
} from "@/lib/store";
import RatesEditor, { type RatesPanelBeater } from "@/components/RatesEditor";

export default async function RatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self")) redirect("/portal");

  let panelBeaters: RatesPanelBeater[];
  if (canManage) {
    panelBeaters = (await getPanelBeaters())
      .map((p) => ({ id: p.id, name: p.tradingAs || p.companyName }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const pb = user.panelBeaterId ? await getPanelBeater(user.panelBeaterId) : null;
    panelBeaters = pb ? [{ id: pb.id, name: pb.tradingAs || pb.companyName }] : [];
  }

  const [insurers, initialCards, initialCustomTypes] = await Promise.all([
    getInsurers(),
    panelBeaters[0] ? getRateCards(panelBeaters[0].id) : Promise.resolve([]),
    panelBeaters[0] ? getCustomRateTypes(panelBeaters[0].id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Rates</h1>
        <p className="text-ink/60">
          Add a rate card for cash work (the client pays directly) and one for each insurer you
          work with. Nothing is required — fill in what applies and leave the rest blank.
        </p>
      </div>
      <RatesEditor
        panelBeaters={panelBeaters}
        insurers={insurers.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name }))}
        initialCards={initialCards}
        initialCustomTypes={initialCustomTypes}
        canManage={canManage}
      />
    </div>
  );
}
