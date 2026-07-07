import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPanelBeaters } from "@/lib/store";
import { zar } from "@/lib/format";
import { Button } from "@/components/ui";

export default async function PanelBeatersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const canManage = can(user, "manage_panel_beaters");
  if (!canManage && !can(user, "onboard_self")) redirect("/portal");

  let list = await getPanelBeaters();
  if (!canManage && user.panelBeaterId) {
    list = list.filter((p) => p.id === user.panelBeaterId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Panel beaters</h1>
          <p className="text-ink/60">
            {canManage
              ? "Workshops in the Price my Prang network."
              : "Your workshop listing."}
          </p>
        </div>
        {(canManage || (!canManage && !user.panelBeaterId)) && (
          <Link href="/portal/panel-beaters/new">
            <Button>+ {canManage ? "Add panel beater" : "Create my listing"}</Button>
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <div className="pmp-card text-center text-ink/50">No panel beaters yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="pmp-card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">
                    {p.tradingAs || p.companyName}
                  </h3>
                  {p.tradingAs && <p className="text-xs text-ink/50">{p.companyName}</p>}
                </div>
                {!p.active && (
                  <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink/60">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-ink/70">{p.physicalAddress}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/50">
                <span>RMI {p.rmiNumber}</span>
                <span>SAMBRA {p.sambraNumber}</span>
                {p.lat == null && <span className="text-coral">⚠ not geocoded</span>}
              </div>
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-ink/60">
                  Snr {p.labourRateSenior ? zar(p.labourRateSenior) : "—"} · Jnr{" "}
                  {p.labourRateJunior ? zar(p.labourRateJunior) : "—"}
                </span>
                <Link
                  href={`/portal/panel-beaters/${p.id}`}
                  className="font-semibold text-teal hover:underline"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
