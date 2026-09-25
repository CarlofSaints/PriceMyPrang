import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import PayButton from "@/components/PayButton";
import { getDb } from "@/lib/db";
import { reconcileRequest } from "@/lib/payments";
import { requestFee } from "@/lib/ozow";

// PUBLIC: where the customer pays, and where Ozow sends them back to. The
// token is the only credential, so it must never be indexed or logged.
//
// Coming back here proves nothing on its own. The page asks Ozow directly
// (reconcileRequest) every time it loads, so what it shows is Ozow's answer.
export const metadata = { robots: { index: false, follow: false } };

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const req = await getDb().quoteRequest.findUnique({
    where: { publicToken: token },
    select: { id: true, reference: true, firstName: true, repairerInitiated: true },
  });
  if (!req || req.repairerInitiated) notFound();

  let state: Awaited<ReturnType<typeof reconcileRequest>>;
  try {
    state = await reconcileRequest(req.id);
  } catch (err) {
    // Ozow unreachable. Never guess "paid"; "still checking" is the honest answer.
    console.error("pay page reconcile failed", err);
    state = "pending";
  }
  const lastFailure =
    state === "unpaid"
      ? await getDb().payment.findFirst({
          where: { requestId: req.id, status: "failed" },
          orderBy: { createdAt: "desc" },
          select: { statusReason: true },
        })
      : null;
  const fee = requestFee().toLocaleString("en-ZA", { minimumFractionDigits: 0 });

  return (
    <div className="min-h-dvh bg-offwhite">
      <header className="bg-ink">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Logo variant="horizontal-dark" className="h-9 w-auto sm:h-11" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="pmp-card space-y-5 text-center">
          <p className="font-mono text-sm font-semibold text-teal">{req.reference}</p>

          {(state === "paid" || state === "not_required") && (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 text-3xl">
                🎉
              </div>
              <h1 className="font-display text-2xl font-bold text-ink">
                {state === "paid" ? "Payment received, thank you" : "Your request is in"}
              </h1>
              <p className="text-ink/70">
                We&apos;re matching your vehicle to the right repairer and we&apos;ll be in contact with
                your quote within the next 24 hours. We&apos;ve emailed you a confirmation.
              </p>
              <Link href={`/quote/${token}`} className="inline-block text-sm font-semibold text-teal underline">
                Your quotes page
              </Link>
            </>
          )}

          {state === "pending" && (
            <>
              <h1 className="font-display text-2xl font-bold text-ink">Your bank is confirming the payment</h1>
              <p className="text-ink/70">
                This usually takes a minute or two. There&apos;s no need to pay again. Refresh this page
                shortly, or keep an eye on your email: we&apos;ll confirm as soon as it clears.
              </p>
            </>
          )}

          {state === "unpaid" && (
            <>
              <h1 className="font-display text-2xl font-bold text-ink">
                Hi {req.firstName}, one step left
              </h1>
              <p className="text-ink/70">
                Your request is saved. Pay the flat R{fee} and we&apos;ll get it to the right repairer.
                You pay securely through Ozow, straight from your bank: we never see your banking details.
              </p>
              {lastFailure?.statusReason && (
                <p className="rounded-xl bg-amber/20 p-3 text-sm text-ink">
                  Your last payment didn&apos;t go through, so nothing was taken. You can try again below.
                </p>
              )}
              <PayButton token={token} label={`Pay R${fee} securely`} />
              <p className="text-xs text-ink/50">
                See our <Link href="/refunds" className="underline">refund policy</Link>.
              </p>
            </>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-ink/40">Keep this page private.</p>
      </main>
    </div>
  );
}
