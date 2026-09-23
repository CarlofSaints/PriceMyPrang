import type { Metadata } from "next";
import Link from "next/link";
import { ContactBlock, ContactUs, LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions · Price my Prang",
  description: "The terms that apply when you use Price my Prang to get a vehicle repair quote.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These terms apply when you use {LEGAL.website.replace("https://", "")} (the
        &quot;site&quot;) to request a vehicle repair quote. The site is run by {LEGAL.legalName}{" "}
        (&quot;{LEGAL.tradingName}&quot;, &quot;we&quot;, &quot;us&quot;). By submitting a request
        or paying for one, you agree to these terms. Please read them with our{" "}
        <Link href="/privacy">Privacy &amp; POPIA Policy</Link> and our{" "}
        <Link href="/refunds">Refund &amp; Cancellation Policy</Link>, which form part of them.
      </p>

      <h2>1. What we do</h2>
      <p>
        {LEGAL.tradingName} is a quoting service. You tell us about the damage to your vehicle and
        send us photos. We match the job to one or more independent panel beaters on our panel,
        and a repair quote is prepared and sent to you. Estimates are reviewed by our team of
        vehicle damage estimators.
      </p>
      <p>
        We do not repair vehicles ourselves. Any repair is a separate agreement between you and
        the panel beater you choose to use. You are never obliged to accept a quote.
      </p>

      <h2>2. Who can use the site</h2>
      <p>
        You must be 18 or older and entitled to act for the vehicle you ask us to quote on (for
        example as its owner, driver, or someone authorised by the owner or insurer).
      </p>

      <h2>3. Your information and photos</h2>
      <ul>
        <li>
          You must give us true and complete information. A quote can only be as accurate as
          the photos and details it is based on.
        </li>
        <li>
          You allow us to share your request, photos and contact details with the panel beaters
          we assign to it, so they can prepare your quote and contact you about it.
        </li>
        <li>
          If you tell us an insurer or third party is involved, you allow us to share the quote
          with them where that is needed to process your claim.
        </li>
      </ul>

      <h2>4. Fees and payment</h2>
      <p>
        We charge a flat fee of {LEGAL.quoteFee} per quote, including VAT where applicable. The
        fee is shown before you pay. It pays for sourcing, reviewing and delivering the quote,
        not for the repair itself. Payment is taken by our payment provider on its own secure
        pages; we never see or store your card or banking details.
      </p>
      <p>
        Refunds and cancellations are covered by our{" "}
        <Link href="/refunds">Refund &amp; Cancellation Policy</Link>.
      </p>

      <h2>5. Quotes are estimates</h2>
      <p>
        A quote is based on what can be seen in your photos and the information you give. Hidden
        damage is often only found once a vehicle is stripped, so the final cost of a repair may
        differ. Any extra work (additionals) is quoted separately and needs your or your
        insurer&apos;s approval before it is done. We aim to deliver your quote within 24 hours of
        assigning your request, but this is a target and not a guarantee.
      </p>

      <h2>6. Panel beaters</h2>
      <p>
        Panel beaters on our panel are independent businesses. We check their accreditation
        before they join, but they carry out repairs under their own terms and are responsible
        for their own workmanship, warranties, pricing and conduct. If you have a problem with a
        repair, you can raise it with us through the{" "}
        <Link href="/feedback">rate your repair</Link> page and we will take it up with the
        workshop.
      </p>

      <h2>7. Acceptable use</h2>
      <p>
        You may not use the site to submit false requests, upload anything unlawful or anything
        you do not have the right to share, try to access parts of the site you are not
        authorised to use, or interfere with how it works.
      </p>

      <h2>8. Our liability</h2>
      <p>
        We provide the quoting service with reasonable care and skill. Subject to the Consumer
        Protection Act, 68 of 2008, and to the extent the law allows, we are not liable for the
        work, advice or conduct of a panel beater, for a repair costing more than a quote, or for
        indirect or consequential loss. Nothing in these terms limits any right you have under
        the Consumer Protection Act or other law that cannot be limited.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. The version that applies to your request is
        the one shown on the site when you submitted it. The date at the top of this page shows
        when they last changed.
      </p>

      <h2>10. Law and disputes</h2>
      <p>
        These terms are governed by the law of the Republic of South Africa. If you are unhappy
        with our service, please <ContactUs /> first so we can try to put it right. You may also
        approach the Consumer Goods and Services Ombud or the National Consumer Commission.
      </p>

      <h2>11. Contact us</h2>
      <ContactBlock />
    </LegalPage>
  );
}
