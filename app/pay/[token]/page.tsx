import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import PayButton from "@/components/PayButton";
import VoucherBox from "@/components/VoucherBox";
import { getDb } from "@/lib/db";
import { reconcileRequest } from "@/lib/payments";
import { hit } from "@/lib/rateLimit";
import { requestFee } from "@/lib/ozow";
import { discountedFee, voucherProblem } from "@/lib/vouchers";
import { openPaymentLink } from "@/lib/payments";
import { zar } from "@/lib/format";

// PUBLIC: where the customer pays, and where Ozow sends them back to. The
// token is the only credential, so it must never be indexed or logged.
//
// Coming back here proves nothing on its own. The page asks Ozow directly
// (reconcileRequest) every time it loads, so what it shows is Ozow's answer.
export const metadata = { robots: { index: false, follow: false } };

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ voucher?: string }>;
}) {
  const { token } = await params;
  const { voucher: voucherFlag } = await searchParams;
  const req = await getDb().quoteRequest.findUnique({
    where: { publicToken: token },
    select: { id: true, reference: true, firstName: true, repairerInitiated: true, voucher: true },
  });
  if (!req || req.repairerInitiated) notFound();

  let state: Awaited<ReturnType<typeof reconcileRequest>>;
  try {
    // A refresh loop on one link must not become a loop on Ozow's API. Over
    // the limit, this load goes by what we already recorded (paid, or "still
    // checking") without asking; the next load after the window asks again.
    const check = await hit("payPageCheck", token);
    state = check.ok
      ? await reconcileRequest(req.id)
      : (await getDb().payment.count({ where: { requestId: req.id, status: "paid" } }))
        ? "paid"
        : "pending";
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
  const fullFee = requestFee();
  const fee = zar(fullFee);
  // A link already open fixes the price until it expires (one live price, lib/payments.ts).
  const open = state === "unpaid" ? await openPaymentLink(req.id) : null;
  // Shown only while it's still good. A lapsed one shows full price, which is
  // also what Pay will charge (it takes the voucher off and checks the price).
  const voucher = req.voucher && !voucherProblem(req.voucher) ? req.voucher : null;
  const amount = open ? open.amount : voucher ? discountedFee(fullFee, voucher.percentOff) : fullFee;
  const free = amount <= 0;
  const until = open?.expiresAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

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
                Your request is saved. {`Pay the flat ${fee} once-off fee and we'll `}get it to the right repairer.
                You pay securely through Ozow, straight from your bank: we never see your banking details.
              </p>
              {voucherFlag === "lapsed" && !voucher && (
                <p className="rounded-xl bg-amber/20 p-3 text-sm text-ink">
                  Sorry, your voucher ran out just before your request went through, so the full price applies.
                </p>
              )}
              {amount !== fullFee && (
                <p className="font-display text-2xl font-bold text-ink">
                  <span className="mr-2 text-lg font-semibold text-ink/40 line-through">{fee}</span>
                  {free ? "Free" : zar(amount)}
                </p>
              )}
              {open ? (
                <p className="text-sm text-ink/60">
                  {`You've already started a payment of ${zar(open.amount)}. Pay below to finish it. To use a voucher instead, come back after ${until}, when that payment link expires.`}
                </p>
              ) : (
                <VoucherBox
                  token={token}
                  applied={voucher ? { code: voucher.code, percentOff: voucher.percentOff, amount, fee: fullFee } : null}
                />
              )}
              {lastFailure?.statusReason && (
                <p className="rounded-xl bg-amber/20 p-3 text-sm text-ink">
                  Your last payment didn&apos;t go through, so nothing was taken. You can try again below.
                </p>
              )}
              <PayButton token={token} expectedAmount={amount} label={free ? "Confirm my request" : `Pay ${zar(amount)} securely`} />
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
