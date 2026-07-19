import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRequest, getPanelBeaters } from "@/lib/store";
import { shortDate, zar } from "@/lib/format";
import { Button } from "@/components/ui";
import StatusControl from "@/components/StatusControl";

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink/50">{label}</dt>
      <dd className="font-semibold text-ink">{value || "—"}</dd>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "view_dashboard")) redirect("/portal/panel-beaters");

  const { reference } = await params;
  const req = await getRequest(reference);
  if (!req) notFound();

  const panelBeaters = await getPanelBeaters();
  const chosen = panelBeaters.filter((p) => req.selectedPanelBeaterIds.includes(p.id));
  const nameFor = (id: string) => {
    const p = panelBeaters.find((x) => x.id === id);
    return p ? p.tradingAs || p.companyName : id;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/portal" className="text-sm text-teal hover:underline">
            ← Dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-ink">{req.reference}</h1>
          <p className="text-sm text-ink/60">
            {req.firstName} {req.lastName} · {shortDate(req.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusControl reference={req.reference} current={req.status} />
          {can(user, "build_quotes") && (
            <Link href={`/portal/quote-builder?ref=${req.reference}`}>
              <Button>Build quotation</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Vehicle + claim details */}
        <div className="space-y-6 lg:col-span-2">
          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Vehicle</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Make" value={req.vehicle.make} />
              <Detail label="Model" value={req.vehicle.model} />
              <Detail label="Series" value={req.vehicle.series} />
              <Detail label="Year" value={req.vehicle.year} />
              <Detail label="Colour" value={req.vehicle.colour} />
              <Detail label="Registration" value={req.vehicle.registration} />
              <Detail label="VIN" value={req.vehicle.vin} />
              <Detail
                label="Mileage"
                value={req.mileageKm ? `${req.mileageKm.toLocaleString("en-ZA")} km` : undefined}
              />
            </dl>
            {req.vehicle.discRawText && (
              <details className="mt-3 text-sm text-ink/60">
                <summary className="cursor-pointer font-semibold">Disc raw text</summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs">{req.vehicle.discRawText}</pre>
              </details>
            )}
          </section>

          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Claim details</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Has insurance" value={req.hasInsurance} />
              <Detail label="Insurer" value={req.insurerName} />
              <Detail label="Insurance claim" value={req.isInsuranceClaim} />
              <Detail
                label="Claim number"
                value={
                  req.isInsuranceClaim === "yes"
                    ? req.noClaimNumberYet
                      ? "Not yet available"
                      : req.claimNumber
                    : undefined
                }
              />
              <Detail label="3rd party claim" value={req.isThirdPartyClaim} />
              <Detail label="Under warranty" value={req.underWarranty} />
              <Detail label="Suspected engine damage" value={req.suspectedEngineDamage} />
              <Detail
                label="Quotes requested"
                value={`${req.quotesRequested}${req.letUsChoose ? " (we choose)" : ""}`}
              />
            </dl>
          </section>

          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Full vehicle photos</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["front", "back", "left", "right"] as const).map((side) => {
                const photo = req.requiredPhotos?.[side];
                return (
                  <div key={side}>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={photo.url} target="_blank" rel="noreferrer">
                        <img
                          src={photo.url}
                          alt={side}
                          className="h-28 w-full rounded-lg object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-ink/20 text-xs text-ink/40">
                        Missing
                      </div>
                    )}
                    <p className="mt-1 text-center text-xs font-semibold capitalize text-ink/60">
                      {side}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">
              Damage photos ({req.damagePhotos.length})
            </h2>
            {req.damagePhotos.length === 0 ? (
              <p className="text-sm text-ink/50">No photos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {req.damagePhotos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                    <img
                      src={p.url}
                      alt={`Damage ${i + 1}`}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              {req.discImage && (
                <a href={req.discImage.url} target="_blank" rel="noreferrer" className="text-teal underline">
                  View licence disc
                </a>
              )}
              {req.odometerImage && (
                <a href={req.odometerImage.url} target="_blank" rel="noreferrer" className="text-teal underline">
                  View odometer
                </a>
              )}
              {req.video && (
                <a href={req.video.url} target="_blank" rel="noreferrer" className="text-teal underline">
                  Watch video
                </a>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar: client, workshops, quotes */}
        <div className="space-y-6">
          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Client</h2>
            <dl className="space-y-3">
              <Detail label="Name" value={`${req.firstName} ${req.lastName}`} />
              <Detail label="Company" value={req.companyName} />
              <Detail label="Email" value={req.email} />
              <Detail label="Contact number" value={req.phone} />
            </dl>
          </section>

          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">
              Selected workshops
            </h2>
            {req.letUsChoose && (
              <p className="mb-3 rounded-lg bg-amber/20 px-3 py-2 text-sm text-ink">
                Client asked us to choose {req.quotesRequested} workshop
                {req.quotesRequested > 1 ? "s" : ""} for them.
              </p>
            )}
            <ul className="space-y-2 text-sm">
              {chosen.length === 0 ? (
                <li className="text-ink/50">
                  {req.letUsChoose ? "None assigned yet." : "None."}
                </li>
              ) : (
                chosen.map((p) => (
                  <li key={p.id} className="rounded-lg bg-ink/5 px-3 py-2">
                    {p.tradingAs || p.companyName}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="pmp-card">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">
              Quotes ({req.quotes.length}/{req.quotesRequested})
            </h2>
            {req.quotes.length === 0 ? (
              <p className="text-sm text-ink/50">No quotes built yet.</p>
            ) : (
              <ul className="space-y-2">
                {req.quotes.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-center justify-between rounded-lg border border-teal/15 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-ink">{nameFor(q.panelBeaterId)}</p>
                      <p className="text-ink/60">{zar(q.total)}</p>
                    </div>
                    {q.pdfUrl && (
                      <a
                        href={q.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal underline"
                      >
                        Download
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
