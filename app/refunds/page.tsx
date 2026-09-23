import type { Metadata } from "next";
import Link from "next/link";
import { ContactBlock, ContactUs, LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · Price my Prang",
  description: "When you can cancel a Price my Prang quote request and how refunds are paid.",
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy">
      <p>
        This policy explains when you can cancel a quote request and when you get your money
        back. It forms part of our <Link href="/terms">Terms &amp; Conditions</Link>. Nothing in
        it takes away any right you have under the Consumer Protection Act or the Electronic
        Communications and Transactions Act.
      </p>

      <h2>1. What you pay for</h2>
      <p>
        The {LEGAL.quoteFee} fee pays for sourcing, reviewing and delivering a repair quote. It is
        not a deposit on the repair, and it is not paid to the panel beater. The repair itself is
        paid for separately, to the panel beater, if you decide to go ahead.
      </p>

      <h2>2. Cancelling before work starts: full refund</h2>
      <p>
        You can cancel your request at any time before we assign it to a panel beater, and we
        will refund the full fee.
      </p>

      <h2>3. When we cannot quote: full refund</h2>
      <p>
        If we cannot deliver a quote, for example because there is no panel beater on our panel
        near your vehicle or no workshop is able to take the job on, we will cancel the request
        and refund the full fee. You do not need to ask.
      </p>

      <h2>4. After work has started</h2>
      <p>
        Once your request has been assigned to a panel beater, work on your quote has begun with
        your agreement, so the fee can no longer be refunded simply because you have changed your
        mind. If you cancel before the quote is delivered, <ContactUs /> and we will consider a
        partial refund, taking into account the work already done.
      </p>

      <h2>5. After the quote is delivered</h2>
      <p>
        The fee is not refundable once your quote has been delivered, whether or not you decide
        to go ahead with the repair. If the quote is clearly wrong or incomplete because of our
        mistake, tell us within 7 days and we will correct it at no charge or refund the fee.
      </p>

      <h2>6. Repairs are between you and the panel beater</h2>
      <p>
        We do not take payment for repairs, so we cannot refund them. Deposits, payment for the
        repair, workmanship and warranty claims are handled by the panel beater under their own
        terms. If you are unhappy with a repair, tell us through the{" "}
        <Link href="/feedback">rate your repair</Link> page and we will take it up with them.
      </p>

      <h2>7. How to ask for a refund</h2>
      <p>
        To cancel or ask for a refund, <ContactUs />. Please give your quote reference number
        (it is in the email we sent you) and the reason.
      </p>

      <h2>8. How refunds are paid</h2>
      <p>
        We respond to refund requests within 5 business days. Approved refunds are paid back
        through the payment provider you used, to the same card or bank account, within 7 to 10
        business days of approval. How quickly the money shows on your statement depends on your
        bank. We do not refund in cash or to a different account.
      </p>

      <h2>9. Contact us</h2>
      <ContactBlock />
    </LegalPage>
  );
}
