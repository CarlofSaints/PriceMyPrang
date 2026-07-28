import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import ConsumerQuoteList, { type ConsumerQuote } from "@/components/ConsumerQuoteList";
import { getRequestByPublicToken, getPanelBeaters } from "@/lib/store";

// PUBLIC page — the consumer's own quotes, reached from the link we email them.
// The token is the only credential, so it must never be indexed or logged.
export const metadata = { robots: { index: false, follow: false } };

export default async function ConsumerQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const request = await getRequestByPublicToken(token);
  if (!request) notFound();

  // Only the workshops that actually quoted are named — the consumer has no
  // business seeing who else was approached.
  const panelBeaters = await getPanelBeaters();
  const nameFor = (id: string) => {
    const pb = panelBeaters.find((p) => p.id === id);
    return pb ? pb.tradingAs || pb.companyName : "Workshop";
  };

  const quotes: ConsumerQuote[] = request.quotes.map((q) => ({
    id: q.id,
    workshopName: nameFor(q.panelBeaterId),
    total: q.total,
    createdAt: q.createdAt,
    pdfUrl: q.pdfUrl,
    status: q.status,
  }));

  const vehicle = [request.vehicle.make, request.vehicle.model, request.vehicle.year]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-dvh bg-offwhite">
      <header className="bg-ink">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo variant="horizontal-dark" className="h-9 w-auto sm:h-11" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="font-display text-3xl font-bold text-ink">Your quotes</h1>
        <p className="mt-1 text-ink/60">
          Hi {request.firstName} — here&apos;s everything we have for{" "}
          {vehicle || "your vehicle"}.
        </p>

        <div className="pmp-card mt-6">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink/50">Reference</dt>
              <dd className="font-mono font-semibold text-teal">{request.reference}</dd>
            </div>
            <div>
              <dt className="text-ink/50">Vehicle</dt>
              <dd className="font-semibold text-ink">{vehicle || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink/50">Quotes requested</dt>
              <dd className="font-semibold text-ink">{request.quotesRequested}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8">
          <ConsumerQuoteList token={token} quotes={quotes} />
        </div>

        <p className="mt-8 text-center text-xs text-ink/40">
          Keep this page private — anyone with the link can see and accept your quotes.
        </p>
      </main>
    </div>
  );
}
