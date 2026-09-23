import type { Metadata } from "next";
import { ContactBlock, ContactUs, LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy & POPIA Policy · Price my Prang",
  description:
    "How Price my Prang collects, uses and protects your personal information under POPIA.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy & POPIA Policy">
      <p>
        {LEGAL.legalName} (&quot;we&quot;, &quot;us&quot;) is the responsible party for the
        personal information collected through this site. We process it in line with the
        Protection of Personal Information Act, 4 of 2013 (&quot;POPIA&quot;). This policy explains
        what we collect, why, who we share it with, and the rights you have.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Your contact details:</strong> name, surname, email address, phone number and,
          if you give it, a company name.
        </li>
        <li>
          <strong>Your vehicle:</strong> make, model, year, registration, VIN, mileage, and
          details read from a photo of the licence disc or odometer if you upload one.
        </li>
        <li>
          <strong>The damage:</strong> the photos and videos you upload and your description of
          what happened.
        </li>
        <li>
          <strong>Location:</strong> the town or suburb and province where the vehicle is, which
          we use to find a panel beater near it. We do not track your device&apos;s location.
        </li>
        <li>
          <strong>Insurance:</strong> your insurer&apos;s name and claim number, if you tell us a
          claim is involved.
        </li>
        <li>
          <strong>Feedback:</strong> ratings and complaints you send us about a repair.
        </li>
        <li>
          <strong>Payment:</strong> a record that you paid, the amount and the payment
          provider&apos;s reference. Card and bank details are handled by the payment provider
          only; we never see or store them.
        </li>
        <li>
          <strong>Technical:</strong> your IP address and basic request information, used to
          keep the site secure and prevent abuse.
        </li>
      </ul>

      <h2>2. Why we use it</h2>
      <ul>
        <li>To prepare, deliver and follow up on the quote you asked for.</li>
        <li>To match your job to a suitable panel beater and let them contact you about it.</li>
        <li>To take payment and deal with refunds.</li>
        <li>To handle ratings, complaints and warranty queries about a repair.</li>
        <li>To keep the site secure, and to meet our legal and tax obligations.</li>
      </ul>
      <p>
        We rely on your consent, on the need to perform the service you asked for, and on our
        legitimate interest in running a safe and reliable service. We do not sell your personal
        information, and we do not send you marketing unless you have asked for it.
      </p>

      <h2>3. Who we share it with</h2>
      <ul>
        <li>
          <strong>Panel beaters</strong> we assign to your request, so they can quote and contact
          you.
        </li>
        <li>
          <strong>Your insurer or a third party</strong>, where you have told us a claim is
          involved and the quote needs to reach them.
        </li>
        <li>
          <strong>Service providers</strong> who run parts of the service for us under contract:
          website hosting and file storage (Vercel), our database (Neon), email delivery
          (Resend), address lookup (Google Maps), reading licence discs and odometers from photos
          (Anthropic), vehicle data lookup, and our payment provider.
        </li>
        <li>
          <strong>Authorities</strong>, where the law requires it.
        </li>
      </ul>

      <h2>4. Information sent outside South Africa</h2>
      <p>
        Some of our service providers store or process information outside South Africa,
        including in the United States and Europe. We only use providers that are bound by
        agreements or laws giving your information a level of protection comparable to POPIA,
        as section 72 of POPIA requires.
      </p>

      <h2>5. How we protect it</h2>
      <p>
        Information is sent over encrypted connections. Your photos and documents are kept in
        private storage and are not publicly listed. Staff and panel beaters only see what their
        role needs, and access is logged. No system is perfectly secure, but if a breach affects
        your information we will tell you and the Information Regulator as POPIA requires.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep your request, quotes and related records for as long as they are needed for the
        service, for any warranty or complaint about the repair, and for the period tax and other
        laws require (generally five years). After that it is deleted or anonymised.
      </p>

      <h2>7. Your rights</h2>
      <p>Under POPIA you may:</p>
      <ul>
        <li>ask whether we hold personal information about you, and ask for a copy of it;</li>
        <li>ask us to correct or delete information that is wrong, out of date or excessive;</li>
        <li>object to us processing your information, or withdraw your consent;</li>
        <li>
          complain to the Information Regulator at{" "}
          <a href="https://inforegulator.org.za" target="_blank" rel="noreferrer">
            inforegulator.org.za
          </a>
          .
        </li>
      </ul>
      <p>
        To use any of these rights, <ContactUs />. We may need to confirm who you are before we
        act. Withdrawing consent or asking for deletion may mean we cannot finish a quote that is
        in progress.
      </p>

      <h2>8. Cookies</h2>
      <p>
        The public site does not use advertising or tracking cookies. We use a cookie only to keep
        staff and panel beaters signed in to the portal.
      </p>

      <h2>9. Information Officer and contact</h2>
      <p>
        Our Information Officer is{" "}
        {LEGAL.informationOfficer || `the managing director of ${LEGAL.legalName}`}.
      </p>
      <ContactBlock />
    </LegalPage>
  );
}
