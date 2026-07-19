import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters } from "@/lib/store";
import NewQuoteClient from "@/components/NewQuoteClient";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can(user, "manage_panel_beaters") || can(user, "build_quotes");
  if (!canManage && !can(user, "onboard_self")) redirect("/portal");

  // A panel-beater login quotes for their own listing. A manager/assessor picks
  // which workshop the quote is for.
  const lockedPbId = user.panelBeaterId || undefined;
  const panelBeaters =
    !lockedPbId && canManage
      ? (await getPanelBeaters())
          .map((p) => ({ id: p.id, name: p.tradingAs || p.companyName }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  return <NewQuoteClient panelBeaters={panelBeaters} lockedPbId={lockedPbId} />;
}
