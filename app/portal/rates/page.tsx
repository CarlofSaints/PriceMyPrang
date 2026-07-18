import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRateTypes, getPanelBeaters, getPanelBeater } from "@/lib/store";
import { sortRateTypes } from "@/lib/rateTypes";
import RatesEditor, { type RatesPanelBeater } from "@/components/RatesEditor";

export default async function RatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self")) redirect("/portal");

  const rateTypes = sortRateTypes((await getRateTypes()).filter((r) => r.active));

  const toSummary = (p: {
    id: string;
    companyName: string;
    tradingAs?: string;
    rates?: Record<string, number>;
  }): RatesPanelBeater => ({
    id: p.id,
    name: p.tradingAs || p.companyName,
    rates: p.rates ?? {},
  });

  let panelBeaters: RatesPanelBeater[];
  if (canManage) {
    panelBeaters = (await getPanelBeaters())
      .map(toSummary)
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const pb = user.panelBeaterId ? await getPanelBeater(user.panelBeaterId) : null;
    panelBeaters = pb ? [toSummary(pb)] : [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Rates</h1>
        <p className="text-ink/60">
          Set your rate card. Nothing here is required — fill in the rates that apply to your
          workshop and leave the rest blank.
        </p>
      </div>
      <RatesEditor rateTypes={rateTypes} panelBeaters={panelBeaters} canManage={canManage} />
    </div>
  );
}
