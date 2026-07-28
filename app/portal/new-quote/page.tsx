import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters, getRateCards } from "@/lib/store";
import NewQuoteClient from "@/components/NewQuoteClient";
import PanelBeaterQuoteForm, { type RateOption } from "@/components/PanelBeaterQuoteForm";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
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

  // The repairer form prices off one of the workshop's own rate cards. A
  // manager hasn't picked a workshop yet, so there's nothing to offer them.
  let rateOptions: RateOption[] = [];
  if (lockedPbId) {
    const cards = await getRateCards(lockedPbId);
    rateOptions = cards.map((c) => ({
      id: c.id,
      label: c.kind === "cash" ? "Cash rates" : `${c.insurerName || "Insurer"} rates`,
    }));
  }

  // A panel-beater login only ever gets the repairer form. Staff choose, because
  // they still need the full consumer journey for phone-in jobs.
  const sp = await searchParams;
  const choice = sp.form;
  const showChooser = canManage && choice !== "repairer" && choice !== "consumer";

  if (showChooser) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Start a new quote</h1>
          <p className="text-ink/60">Which form do you want to use?</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/portal/new-quote?form=repairer" className="pmp-card block hover:border-teal/50">
            <h2 className="font-display text-lg font-semibold text-ink">Panel beater form</h2>
            <p className="mt-1 text-sm text-ink/60">
              The workshop already has the car. Client details, rate off the rate card, vehicle and
              photos — no map step, no video.
            </p>
          </Link>
          <Link href="/portal/new-quote?form=consumer" className="pmp-card block hover:border-teal/50">
            <h2 className="font-display text-lg font-semibold text-ink">Consumer form</h2>
            <p className="mt-1 text-sm text-ink/60">
              The full journey a consumer goes through, including insurance questions and the
              engine-damage check.
            </p>
          </Link>
        </div>
      </div>
    );
  }

  if (!canManage || choice === "repairer") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">New quote</h1>
          <p className="text-ink/60">Capture the job, then price it in the quote builder.</p>
        </div>
        <PanelBeaterQuoteForm
          panelBeaters={panelBeaters}
          lockedPbId={lockedPbId}
          rateOptions={rateOptions}
        />
      </div>
    );
  }

  return <NewQuoteClient panelBeaters={panelBeaters} lockedPbId={lockedPbId} />;
}
