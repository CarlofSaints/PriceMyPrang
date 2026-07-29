import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import AgreementSigner from "@/components/AgreementSigner";
import { getRepairerAgreementByToken, getPanelBeater } from "@/lib/store";
import { shortDate } from "@/lib/format";

// PUBLIC page — reached from the emailed link. The token is the only
// credential, so it must never be indexed.
export const metadata = { robots: { index: false, follow: false } };

export default async function AgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await getRepairerAgreementByToken(token);
  if (!found) notFound();

  const { agreement, document } = found;
  const pb = await getPanelBeater(agreement.panelBeaterId);
  const companyName = pb ? pb.tradingAs || pb.companyName : agreement.sentToName;
  const signed = !!agreement.signedAt;

  return (
    <div className="min-h-dvh bg-offwhite">
      <header className="bg-ink">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 sm:px-6">
          <Logo variant="horizontal-dark" className="h-9 w-auto sm:h-11" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="font-display text-3xl font-bold text-ink">{document.title}</h1>
        <p className="mt-1 text-ink/60">
          For {companyName}
          {pb?.companyRegNumber ? ` · Reg ${pb.companyRegNumber}` : ""}
        </p>

        {signed && (
          <div className="mt-6 rounded-2xl border border-teal/30 bg-teal/10 p-4">
            <p className="font-display text-base font-semibold text-ink">
              Signed on {shortDate(agreement.signedAt!)}
            </p>
            <p className="mt-1 text-sm text-ink/70">
              Signed by {agreement.signerName}
              {agreement.signerTitle ? `, ${agreement.signerTitle}` : ""}. A copy was emailed to{" "}
              {agreement.sentToEmail}.
            </p>
            {agreement.pdfUrl && (
              <a
                href={agreement.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-teal hover:underline"
              >
                Download the signed copy (PDF)
              </a>
            )}
          </div>
        )}

        {/* The agreement itself, converted from the uploaded Word document. */}
        <article
          className="pmp-card prose-agreement mt-6 max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-ink/85"
          dangerouslySetInnerHTML={{ __html: document.html }}
        />

        <div className="mt-6">
          {signed ? (
            <p className="text-sm text-ink/60">
              This agreement has already been signed and can&apos;t be signed again. If something
              needs changing, contact us and we&apos;ll issue a new one.
            </p>
          ) : (
            <AgreementSigner token={token} companyName={companyName} />
          )}
        </div>
      </main>
    </div>
  );
}
