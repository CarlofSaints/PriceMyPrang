import { Resend } from "resend";
import type {
  Additional,
  Complaint,
  DevTicket,
  PanelBeater,
  QuoteLineItem,
  QuoteRequest,
  WarrantyApproval,
} from "./types";
import {
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_OUTCOME_LABEL,
  VEHICLE_SAFETY_LABEL,
} from "./types";
import { DEV_PRIORITY_SHORT, DEV_STATUS_LABEL } from "./types";
import { getUsers, getRoles } from "./store";
import { permissionsForRole } from "./permissions";

const BRAND = {
  teal: "#00848D",
  coral: "#F05940",
  ink: "#052F35",
  offwhite: "#ECF8F8",
};

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function shell(title: string, body: string): string {
  const logo = `${baseUrl()}/brand/png/lockup-horizontal-dark.png`;
  return `
  <div style="background:${BRAND.offwhite};padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,132,141,0.12);">
      <div style="background:${BRAND.ink};padding:20px 24px;text-align:center;">
        <img src="${logo}" alt="Price my Prang" style="height:34px;width:auto;" />
      </div>
      <div style="padding:28px 24px;">
        <h1 style="font-size:20px;margin:0 0 12px;color:${BRAND.ink};">${title}</h1>
        ${body}
      </div>
      <div style="background:${BRAND.offwhite};padding:16px 24px;text-align:center;font-size:12px;color:#6b7f82;">
        Price my Prang · Crash · Quote · Claim
      </div>
    </div>
  </div>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7f82;font-size:13px;">${label}</td>
    <td style="padding:6px 0;font-size:13px;text-align:right;font-weight:bold;">${value || "—"}</td>
  </tr>`;
}

/**
 * Where a "choose your own password" token is redeemed.
 *
 * Lives here because baseUrl() does, and every caller that mints a token is
 * about to put this in an email. NEXT_PUBLIC_APP_URL is build-time, so a link
 * built here points at whatever the deploy was built with — the www domain in
 * production.
 */
export function passwordSetUrl(token: string): string {
  return `${baseUrl()}/set-password/${token}`;
}

function fromAddress(): string {
  // Override with EMAIL_FROM (e.g. prang@pricemyprang.co.za). Falls back to the
  // Resend sandbox sender for local/testing.
  return process.env.EMAIL_FROM || "Price my Prang <onboarding@resend.dev>";
}

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

/**
 * Who gets internal notifications (new quote requests, panel-beater applications).
 * Derived from the USER LIST — anyone active who can view the dashboard
 * (admins + assessors, set in the portal). ADMIN_NOTIFY_EMAILS is an optional
 * extra for external addresses that aren't portal users.
 */
async function notifyRecipients(): Promise<string[]> {
  const set = new Set<string>();
  try {
    const [users, roles] = await Promise.all([getUsers(), getRoles()]);
    users
      .filter(
        (u) =>
          u.active &&
          u.email &&
          permissionsForRole(u.role, roles).includes("view_dashboard")
      )
      .forEach((u) => set.add(u.email));
  } catch {
    // ignore — fall back to env below
  }
  (process.env.ADMIN_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((e) => set.add(e));
  return [...set];
}

export async function sendConsumerConfirmation(req: QuoteRequest, chosen: PanelBeater[]) {
  const resend = client();
  if (!resend) return;

  const workshops = chosen
    .map((p) => `<li style="margin-bottom:4px;">${p.tradingAs || p.companyName}</li>`)
    .join("");

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${req.firstName},</p>
    <p style="font-size:15px;line-height:1.5;">
      Thank you for your submission. The details of this quote request will be sent to the
      provider${chosen.length > 1 ? "s" : ""} of your choice. We&apos;ll be in contact with your
      quote within the next 24 hours.
    </p>
    <div style="background:${BRAND.ink};border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <div style="color:${BRAND.teal};font-size:11px;letter-spacing:2px;text-transform:uppercase;">Your reference number</div>
      <div style="color:#fff;font-size:20px;font-weight:bold;margin-top:4px;">${req.reference}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRow("Vehicle", [req.vehicle.make, req.vehicle.model, req.vehicle.year].filter(Boolean).join(" "))}
      ${detailRow("Quotes requested", String(req.quotesRequested))}
    </table>
    ${
      req.letUsChoose
        ? `<p style="font-size:14px;margin-top:16px;">You asked us to choose your workshop${req.quotesRequested > 1 ? "s" : ""} — we'll line up ${req.quotesRequested} suitable repairer${req.quotesRequested > 1 ? "s" : ""} near you.</p>`
        : `<p style="font-size:14px;margin-top:16px;">Your selected workshop${chosen.length > 1 ? "s" : ""}:</p>
    <ul style="font-size:14px;padding-left:18px;">${workshops}</ul>`
    }
  `;

  await resend.emails.send({
    from: fromAddress(),
    to: req.email,
    subject: `We've got your prang — ${req.reference}`,
    html: shell("Thank you for your submission", body),
  });
}

export async function sendAdminNotification(req: QuoteRequest, chosen: PanelBeater[]) {
  const resend = client();
  if (!resend) return;

  const to = await notifyRecipients();
  if (to.length === 0) return;

  const abs = (u?: string) => (u && u.startsWith("/") ? `${baseUrl()}${u}` : u || "");
  const photos = req.damagePhotos
    .map(
      (p) =>
        `<a href="${abs(p.url)}" style="color:${BRAND.teal};font-size:12px;margin-right:8px;">photo</a>`
    )
    .join("");
  const sidePhotos = (["front", "back", "left", "right"] as const)
    .map((side) => {
      const ref = req.requiredPhotos?.[side];
      return ref
        ? `<a href="${abs(ref.url)}" style="color:${BRAND.teal};font-size:12px;margin-right:8px;">${side}</a>`
        : `<span style="color:#b45309;font-size:12px;margin-right:8px;">${side}: missing</span>`;
    })
    .join("");
  const claimNumberText =
    req.isInsuranceClaim === "yes"
      ? req.noClaimNumberYet
        ? "not yet available"
        : req.claimNumber || "—"
      : "—";

  const body = `
    <p style="font-size:15px;">A new quote request has come in and needs assessment.</p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Client", `${req.firstName} ${req.lastName}`)}
        ${detailRow("Company", req.companyName || "")}
        ${detailRow("Email", req.email)}
        ${detailRow("Contact number", req.phone || "")}
        ${detailRow("Vehicle", [req.vehicle.make, req.vehicle.model, req.vehicle.year, req.vehicle.colour].filter(Boolean).join(" "))}
        ${detailRow("VIN", req.vehicle.vin || "")}
        ${detailRow("Mileage", req.mileageKm ? `${req.mileageKm.toLocaleString("en-ZA")} km` : "")}
        ${detailRow("Insurance", req.hasInsurance)}
        ${detailRow("Insurer", req.insurerName || "")}
        ${detailRow("Insurance claim", req.isInsuranceClaim)}
        ${detailRow("Claim number", claimNumberText)}
        ${detailRow("3rd party claim", req.isThirdPartyClaim)}
        ${detailRow("Under warranty", req.underWarranty)}
        ${detailRow("Suspected engine damage", req.suspectedEngineDamage)}
        ${detailRow("Quotes requested", `${req.quotesRequested}${req.letUsChoose ? " (we choose)" : ""}`)}
        ${detailRow("Workshops", req.letUsChoose ? "Client asked us to choose" : chosen.map((p) => p.tradingAs || p.companyName).join(", "))}
      </table>
    </div>
    <p style="font-size:13px;">Full vehicle photos: ${sidePhotos}</p>
    <p style="font-size:13px;">Damage close-ups: ${photos || "—"}</p>
    ${req.video ? `<p style="font-size:13px;">Video: <a href="${abs(req.video.url)}" style="color:${BRAND.teal};">watch</a></p>` : ""}
    ${req.discImage ? `<p style="font-size:13px;">Licence disc: <a href="${abs(req.discImage.url)}" style="color:${BRAND.teal};">view</a></p>` : ""}
    ${req.odometerImage ? `<p style="font-size:13px;">Odometer: <a href="${abs(req.odometerImage.url)}" style="color:${BRAND.teal};">view</a></p>` : ""}
    <p style="margin-top:20px;">
      <a href="${baseUrl()}/portal/requests/${req.reference}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Open in portal
      </a>
    </p>
  `;

  await resend.emails.send({
    from: fromAddress(),
    to,
    subject: `New prang to quote — ${req.reference} (${req.firstName} ${req.lastName})`,
    html: shell("New quote request", body),
  });
}

/**
 * The block that tells somebody how to get in.
 *
 * TWO SHAPES, and the link one is the default everywhere it is offered.
 *
 *  - setPasswordUrl: a one-time link to choose their own password. Nothing
 *    secret is written in the message, so a forwarded copy is worth nothing
 *    once it has been used, and — the reason this was built — the message no
 *    longer looks like a phishing attempt to a spam filter. Microsoft 365
 *    quarantined every password-carrying email we sent to one repairer, and
 *    the app had no way of knowing.
 *
 *  - password: the old plaintext credential. STILL SUPPORTED ON PURPOSE, for
 *    the case where an admin has deliberately chosen a password to hand over
 *    themselves. Not used by anything that sends automatically.
 */
function accessBlock(opts: {
  email: string;
  password?: string;
  setPasswordUrl?: string;
  ctaLabel: string;
}): string {
  if (opts.setPasswordUrl) {
    return `
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Your sign-in address", opts.email)}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${opts.setPasswordUrl}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        ${opts.ctaLabel}
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      If the button doesn&apos;t work, copy this into your browser:<br />
      <span style="word-break:break-all;">${opts.setPasswordUrl}</span>
    </p>`;
  }

  return `
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Login", opts.email)}
        ${detailRow("Temporary password", opts.password || "—")}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${baseUrl()}/login"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Sign in to the portal
      </a>
    </p>`;
}

export async function sendUserCredentials(opts: {
  name: string;
  email: string;
  /** A password to hand over. Mutually exclusive with setPasswordUrl. */
  password?: string;
  /** A one-time link to choose their own password. Preferred — see accessBlock. */
  setPasswordUrl?: string;
  roleName?: string;
  isReset?: boolean;
  mustChangePassword?: boolean;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const link = !!opts.setPasswordUrl;
  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.name},</p>
    <p style="font-size:15px;line-height:1.5;">
      ${
        opts.isReset
          ? link
            ? "Somebody at Price my Prang asked us to send you a link to set a new portal password."
            : "Your Price my Prang portal password has been reset."
          : "An account has been created for you on the Price my Prang portal" +
            (opts.roleName ? ` as <strong>${opts.roleName}</strong>` : "") +
            "."
      }
    </p>
    ${accessBlock({
      email: opts.email,
      password: opts.password,
      setPasswordUrl: opts.setPasswordUrl,
      ctaLabel: opts.isReset ? "Set a new password" : "Choose your password",
    })}
    <p style="font-size:13px;color:#6b7f82;">
      ${
        link
          ? "The link works once. Until you use it, nothing about your account changes."
          : opts.mustChangePassword
          ? "You&apos;ll be asked to choose your own password as soon as you sign in."
          : "Please sign in and change your password."
      }
      If you weren&apos;t expecting this, you can ignore this email.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.email,
      subject: opts.isReset
        ? link
          ? "Set a new Price my Prang password"
          : "Your Price my Prang password was reset"
        : "Your Price my Prang portal login",
      html: shell(opts.isReset ? "Set a new password" : "Welcome to Price my Prang", body),
    });
    if (error) return { sent: false, error: (error as { message?: string }).message || "send failed" };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

export async function sendWarrantyExpiryReminder(
  pb: PanelBeater,
  w: WarrantyApproval,
  windowLabel: string
): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const to = Array.from(
    new Set([pb.completedByEmail, pb.ownerEmail, pb.email].filter(Boolean) as string[])
  );
  if (to.length === 0) return { sent: false, error: "no contact email on this panel beater" };

  const prettyDate = w.expiryDate
    ? new Date(`${w.expiryDate}T00:00:00Z`).toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${pb.completedByName || pb.ownerName || "there"},</p>
    <p style="font-size:15px;line-height:1.5;">
      This is a friendly reminder that your <strong>${w.manufacturer}</strong> warranty-approval
      certificate for <strong>${pb.tradingAs || pb.companyName}</strong> is due to expire
      <strong>${windowLabel}</strong>.
    </p>
    <div style="background:${BRAND.ink};border-radius:12px;padding:16px;text-align:center;margin:18px 0;">
      <div style="color:${BRAND.teal};font-size:11px;letter-spacing:2px;text-transform:uppercase;">Certificate expires</div>
      <div style="color:#fff;font-size:20px;font-weight:bold;margin-top:4px;">${w.manufacturer} · ${prettyDate}</div>
    </div>
    <p style="font-size:14px;line-height:1.5;color:#41575b;">
      Please arrange to renew this certificate with ${w.manufacturer} before it lapses, and update
      your details on Price my Prang once renewed.
    </p>
    <p style="font-size:13px;line-height:1.5;color:#6b7f82;background:${BRAND.offwhite};border-radius:10px;padding:12px;">
      <strong>Please note:</strong> this is only a reminder. Price my Prang cannot renew, extend or take
      any action on this certificate on your behalf — renewal is between you and the manufacturer.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `Reminder: your ${w.manufacturer} warranty certificate expires ${windowLabel}`,
      html: shell("Warranty certificate reminder", body),
    });
    if (error) return { sent: false, error: (error as { message?: string }).message || "send failed" };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/**
 * Tells the consumer a quote has landed and links them to their own page to
 * compare and accept one. The link carries the request's publicToken — the
 * reference is guessable, so it can't be what gates the page.
 */
export async function sendConsumerQuoteReady(
  req: QuoteRequest,
  pb: PanelBeater,
  quoteTotal: number
): Promise<void> {
  const resend = client();
  if (!resend || !req.publicToken) return;

  const link = `${baseUrl()}/quote/${req.publicToken}`;
  const money = `R ${quoteTotal.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${req.firstName},</p>
    <p style="font-size:15px;line-height:1.5;">
      <strong>${pb.tradingAs || pb.companyName}</strong> has sent through a quote for your
      ${[req.vehicle.make, req.vehicle.model].filter(Boolean).join(" ") || "vehicle"}.
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Workshop", pb.tradingAs || pb.companyName)}
        ${detailRow("Quote total (incl VAT)", money)}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${link}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        View and accept your quotes
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      You can compare every quote on your job on that page and accept the one you want. Accepting
      one lets the other workshops know they weren&apos;t selected. Keep this link private — anyone
      with it can see and accept your quotes.
    </p>
    <p style="font-size:13px;color:#6b7f82;border-top:1px solid rgba(0,132,141,0.12);padding-top:14px;">
      Once the work is done, you can
      <a href="${baseUrl()}/feedback" style="color:${BRAND.teal};">rate your repairer</a> — or tell
      us if something went wrong. You&apos;ll need reference <strong>${req.reference}</strong>,
      which is why it&apos;s worth keeping this email.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: req.email,
      subject: `Your quote from ${pb.tradingAs || pb.companyName} — ${req.reference}`,
      html: shell("You have a new quote", body),
    });
  } catch (err) {
    console.error("consumer quote email failed", err);
  }
}

/**
 * The SECOND registration email: the agreement to sign. Deliberately separate
 * from the welcome/credentials one — a contract shouldn't arrive as a footnote
 * to a password, and they'll want to forward it to whoever signs.
 */
export async function sendRepairerAgreementInvite(opts: {
  name: string;
  email: string;
  companyName: string;
  token: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const link = `${baseUrl()}/agreement/${opts.token}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.name},</p>
    <p style="font-size:15px;line-height:1.5;">
      Before <strong>${opts.companyName}</strong> joins the panel, we need your agreement to our
      repairer terms — the Terms &amp; Conditions, disclaimers, non-disclosure undertaking and
      service level agreement.
    </p>
    <p style="font-size:15px;line-height:1.5;">
      You can read and sign it online. It takes a minute, and you&apos;ll be emailed a signed copy
      for your records.
    </p>
    <p style="margin:20px 0;">
      <a href="${link}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Read and sign the agreement
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      Whoever signs must be authorised to bind the business. If that isn&apos;t you, forward this
      email to the person who is — the link works for them too. Keep it private; anyone with it
      can sign on your behalf.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.email,
      subject: `Your Price my Prang repairer agreement — ${opts.companyName}`,
      html: shell("Repairer agreement", body),
    });
    if (error)
      return { sent: false, error: (error as { message?: string }).message || "send failed" };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/** The signed copy, to the repairer and to our own notification list. */
export async function sendSignedAgreementCopy(opts: {
  to: string;
  signerName: string;
  companyName: string;
  pdf: Buffer;
}): Promise<void> {
  const resend = client();
  if (!resend) return;

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.signerName},</p>
    <p style="font-size:15px;line-height:1.5;">
      Thanks — the repairer agreement for <strong>${opts.companyName}</strong> is signed. A copy is
      attached for your records, including the date and time it was accepted.
    </p>
    <p style="font-size:13px;color:#6b7f82;">Please keep this somewhere safe.</p>
  `;

  const attachments = [
    {
      filename: `price-my-prang-repairer-agreement-${opts.companyName
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()}.pdf`,
      content: opts.pdf,
    },
  ];

  // Our own copy goes to the same people who get new-registration alerts.
  const internal = await notifyRecipients();

  await resend.emails.send({
    from: fromAddress(),
    to: opts.to,
    ...(internal.length ? { bcc: internal } : {}),
    subject: `Signed repairer agreement — ${opts.companyName}`,
    html: shell("Agreement signed", body),
    attachments,
  });
}

/**
 * Sent to the applicant when they submit the sign-up form: confirmation that
 * we have it, what happens next, and the login we created for them. One email,
 * not two — they shouldn't have to reconcile a welcome with a separate password.
 */
export async function sendPanelBeaterWelcome(opts: {
  name: string;
  email: string;
  /** A password to hand over. Mutually exclusive with setPasswordUrl. */
  password?: string;
  /** A one-time link to choose their own password. Preferred — see accessBlock. */
  setPasswordUrl?: string;
  companyName: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const link = !!opts.setPasswordUrl;
  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.name},</p>
    <p style="font-size:15px;line-height:1.5;">
      Thanks for putting <strong>${opts.companyName}</strong> forward to join our panel. We have
      your application and our team is checking your documents.
    </p>
    <p style="font-size:15px;line-height:1.5;">
      ${
        link
          ? "Choose a password and you can sign in straight away to finish setting up your listing and your rates."
          : "You can sign in straight away to finish setting up your listing and your rates."
      }
      Until your documents have been checked your workshop won&apos;t appear to consumers, and
      you&apos;ll see a reminder in the portal until it does.
    </p>
    ${accessBlock({
      email: opts.email,
      password: opts.password,
      setPasswordUrl: opts.setPasswordUrl,
      ctaLabel: "Choose your password",
    })}
    <p style="font-size:13px;color:#6b7f82;">
      ${
        link
          ? "The link works once, and only you can use it."
          : "You&apos;ll be asked to choose your own password as soon as you sign in."
      }
      If you weren&apos;t expecting this, you can ignore this email.
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.email,
      subject: `Welcome to the panel — ${opts.companyName}`,
      html: shell("Welcome to the panel", body),
    });
    if (error)
      return { sent: false, error: (error as { message?: string }).message || "send failed" };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

export async function sendPanelBeaterRegistrationNotification(pb: PanelBeater) {
  const resend = client();
  if (!resend) return;

  const to = await notifyRecipients();
  if (to.length === 0) return;

  const body = `
    <p style="font-size:15px;">A panel beater has applied to join the panel and is awaiting approval.</p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Company", pb.companyName)}
        ${detailRow("Trading as", pb.tradingAs || "")}
        ${detailRow("Reg number", pb.companyRegNumber)}
        ${detailRow("VAT number", pb.vatNumber || "")}
        ${detailRow("Address", pb.physicalAddress)}
        ${detailRow("MIBCO", pb.mibcoNumber || "")}
        ${detailRow("RMI", pb.rmiNumber)}
        ${detailRow("SAMBRA", pb.sambraNumber || "")}
        ${detailRow("MIWA", pb.miwaNumber || "")}
        ${detailRow("Contact", [pb.email, pb.phone].filter(Boolean).join(" · "))}
      </table>
    </div>
    <p style="margin-top:20px;">
      <a href="${baseUrl()}/portal/panel-beaters"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Review & approve
      </a>
    </p>
  `;

  await resend.emails.send({
    from: fromAddress(),
    to,
    subject: `New panel beater application — ${pb.tradingAs || pb.companyName}`,
    html: shell("Panel beater application", body),
  });
}

/**
 * A consumer picked "Other / not listed" and typed their own insurer. Tells the
 * admins so the name can be checked and added to the dropdown, which is what
 * stops the next person having to type it too.
 *
 * Deliberately only a notification: the app never creates the insurer itself.
 * The typed name is unverified consumer input — "Discovry", "my broker", "work
 * policy" — and letting that into a list other people choose from would corrupt
 * it within a week.
 */
export async function sendUnknownInsurerNotification(req: QuoteRequest) {
  const resend = client();
  if (!resend || !req.insurerName) return;

  const to = await notifyRecipients();
  if (to.length === 0) return;

  const body = `
    <p style="font-size:15px;line-height:1.5;">
      A customer chose <strong>Other / not listed</strong> for their insurance company and typed
      the name in themselves.
    </p>
    <div style="background:${BRAND.ink};border-radius:12px;padding:16px;text-align:center;margin:18px 0;">
      <div style="color:${BRAND.teal};font-size:11px;letter-spacing:2px;text-transform:uppercase;">They typed</div>
      <div style="color:#fff;font-size:20px;font-weight:bold;margin-top:4px;">${escapeHtml(req.insurerName)}</div>
    </div>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Customer", `${req.firstName} ${req.lastName}`)}
        ${detailRow(
          "Vehicle",
          [req.vehicle?.make, req.vehicle?.model, req.vehicle?.year].filter(Boolean).join(" ")
        )}
      </table>
    </div>
    <p style="font-size:14px;line-height:1.5;color:#41575b;">
      If that is a real insurer, add it on the Insurance companies page and it will appear in the
      dropdown for everyone from then on. If it's a typo or a broker rather than an insurer, just
      ignore this — nothing has been added automatically.
    </p>
    <p style="margin-top:20px;">
      <a href="${baseUrl()}/portal/admin/insurers"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Add it to the list
      </a>
    </p>
  `;

  await resend.emails.send({
    from: fromAddress(),
    to,
    subject: `Insurer not on the list — "${req.insurerName}"`,
    html: shell("An insurer we don't have", body),
  });
}

/**
 * The reminder a dev ticket was given a date for. Goes to whoever LOGGED the
 * ticket — they're the one who wanted to be nudged. If that address is missing
 * (an old ticket, or the author was deleted) it falls back to the admin list,
 * because a reminder nobody receives is worse than one sent to the team.
 */
export async function sendDevTicketReminder(
  ticket: DevTicket
): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const to = ticket.createdByEmail ? [ticket.createdByEmail] : await notifyRecipients();
  if (to.length === 0) return { sent: false, error: "no recipient for this ticket" };

  const due = ticket.remindOn
    ? new Date(`${ticket.remindOn}T00:00:00Z`).toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${ticket.createdByName || "there"},</p>
    <p style="font-size:15px;line-height:1.5;">
      You asked to be reminded about this item in the dev pipeline.
    </p>
    <div style="background:${BRAND.ink};border-radius:12px;padding:16px;margin:18px 0;">
      <div style="color:${BRAND.teal};font-size:11px;letter-spacing:2px;text-transform:uppercase;">
        ${DEV_PRIORITY_SHORT[ticket.priority]} · ${DEV_STATUS_LABEL[ticket.status]}
      </div>
      <div style="color:#fff;font-size:18px;font-weight:bold;margin-top:6px;">${ticket.title}</div>
      ${due ? `<div style="color:#9fc4c8;font-size:13px;margin-top:6px;">Reminder set for ${due}</div>` : ""}
    </div>
    ${
      ticket.detail
        ? `<p style="font-size:14px;line-height:1.5;color:#41575b;white-space:pre-wrap;">${escapeHtml(ticket.detail)}</p>`
        : ""
    }
    ${
      ticket.attachments.length
        ? `<p style="font-size:13px;color:#6b7f82;">${ticket.attachments.length} attachment${ticket.attachments.length === 1 ? "" : "s"} on this ticket.</p>`
        : ""
    }
    <p style="margin-top:20px;">
      <a href="${baseUrl()}/portal/admin/dev-planner"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Open the dev planner
      </a>
    </p>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `Reminder — ${ticket.title} (${DEV_PRIORITY_SHORT[ticket.priority]})`,
      html: shell("Dev pipeline reminder", body),
    });
    if (error)
      return { sent: false, error: (error as { message?: string }).message || "send failed" };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/** Ticket detail is user-typed and goes into an HTML email — escape it. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The one-time link a consumer asks for when they want to rate their repairer
 * or lodge a complaint.
 *
 * They type their REFERENCE on the site, but PMP-date-SURNAME-nn is guessable —
 * it names a job, it doesn't prove you own one. This email is what turns a
 * reference into proof: it can only be read by whoever holds the address
 * already on the job.
 */
export async function sendConsumerFeedbackLink(
  req: QuoteRequest,
  token: string
): Promise<void> {
  const resend = client();
  if (!resend || !req.email) return;

  const link = `${baseUrl()}/feedback/${token}`;
  const vehicle = [req.vehicle.make, req.vehicle.model].filter(Boolean).join(" ") || "your vehicle";

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${req.firstName},</p>
    <p style="font-size:15px;line-height:1.5;">
      You asked for a link to leave feedback on the repair to ${vehicle}.
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${link}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Rate your repairer
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      From there you can leave a star rating, or raise a complaint if something went wrong.
      This link works for 48 hours and is personal to you — please don&apos;t forward it.
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      If you didn&apos;t ask for this, you can ignore this email. Nothing has changed on your job.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: req.email,
      subject: `Leave feedback on your repair — ${req.reference}`,
      html: shell("Your feedback link", body),
    });
  } catch (err) {
    console.error("consumer feedback link email failed", err);
  }
}

/** "Prove you own this address" — sent on sign-up and on request. */
export async function sendEmailVerification(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const resend = client();
  if (!resend) return;

  const link = `${baseUrl()}/verify-email/${token}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${name},</p>
    <p style="font-size:15px;line-height:1.5;">
      Please confirm this is your email address. It's how we reach you about quotes, and
      it's the address we'd use if we ever needed to verify who you are.
    </p>
    <p style="margin:20px 0;">
      <a href="${link}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Confirm my email
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      This link works for 3 days. If you didn&apos;t create a Price my Prang account, you can
      ignore this email — nothing happens until the link is used.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: email,
      subject: "Confirm your email address",
      html: shell("One quick check", body),
    });
  } catch (err) {
    console.error("email verification send failed", err);
  }
}

/**
 * The second-factor code. Deliberately spare: no link, nothing to click, and
 * an explicit line about what to do if it wasn't them — a code arriving out of
 * nowhere is the earliest sign someone else has your password.
 */
export async function sendLoginCode(
  email: string,
  name: string,
  code: string
): Promise<void> {
  const resend = client();
  if (!resend) return;

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${name},</p>
    <p style="font-size:15px;line-height:1.5;">Your sign-in code is:</p>
    <p style="margin:18px 0;text-align:center;">
      <span style="display:inline-block;background:${BRAND.offwhite};border-radius:12px;
                   padding:14px 26px;font-size:30px;letter-spacing:7px;font-weight:bold;
                   font-family:monospace;color:${BRAND.ink};">${code}</span>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      It expires in 10 minutes and can only be used once. We will never ask you for it —
      not by phone, not by email, not by WhatsApp.
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      <strong>If you weren&apos;t signing in just now</strong>, someone else has your password.
      Change it as soon as you can and let us know.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: email,
      subject: `${code} is your Price my Prang sign-in code`,
      html: shell("Your sign-in code", body),
    });
  } catch (err) {
    console.error("login code send failed", err);
  }
}

/**
 * A complaint has been lodged. Goes to Price my Prang AND to the repairer named
 * in it — Carl's instruction, and the consumer is told so before they submit.
 *
 * An unsafe vehicle changes the subject line rather than adding a field
 * somewhere in the body: this lands in a mailbox alongside everything else, and
 * "not safe to drive" has to be legible without opening it.
 */
export async function sendComplaintLodged(
  complaint: Complaint,
  req: QuoteRequest,
  pb: PanelBeater | null
): Promise<void> {
  const resend = client();
  if (!resend) return;

  const staff = await notifyRecipients();
  const repairer = pb?.email || pb?.ownerEmail || pb?.completedByEmail;
  const to = [...new Set([...staff, ...(repairer ? [repairer] : [])])];
  if (!to.length) return;

  const unsafe = complaint.vehicleSafety === "unsafe";
  const vehicle =
    [req.vehicle.make, req.vehicle.model, req.vehicle.year].filter(Boolean).join(" ") ||
    "the vehicle";

  const body = `
    ${
      unsafe
        ? `<p style="background:#fdecea;border-left:4px solid ${BRAND.coral};padding:12px 14px;margin:0 0 16px;font-size:15px;">
             <strong>The customer says this vehicle is not safe to drive.</strong>
           </p>`
        : ""
    }
    <p style="font-size:15px;line-height:1.5;">
      A customer has raised a complaint about a repair carried out by
      <strong>${pb ? pb.tradingAs || pb.companyName : "a workshop"}</strong>.
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Customer", `${req.firstName} ${req.lastName}`)}
        ${detailRow("Contact", `${req.email}${req.phone ? ` · ${req.phone}` : ""}`)}
        ${detailRow("Vehicle", vehicle)}
        ${req.vehicle.registration ? detailRow("Registration", req.vehicle.registration) : ""}
        ${detailRow("About", COMPLAINT_CATEGORY_LABEL[complaint.category])}
        ${
          complaint.vehicleSafety
            ? detailRow("Safe to drive?", VEHICLE_SAFETY_LABEL[complaint.vehicleSafety])
            : ""
        }
        ${
          complaint.desiredOutcome
            ? detailRow("They want", COMPLAINT_OUTCOME_LABEL[complaint.desiredOutcome])
            : ""
        }
        ${complaint.media.length ? detailRow("Attached", `${complaint.media.length} file(s)`) : ""}
      </table>
    </div>
    <p style="font-size:13px;color:#6b7f82;margin-bottom:4px;">In their words:</p>
    <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;background:#fff;
              border:1px solid rgba(0,132,141,0.15);border-radius:12px;padding:14px;">${
                complaint.description
              }</p>
    <p style="margin:20px 0;">
      <a href="${baseUrl()}/portal/complaints"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Open it in the portal
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      Record what you do about this on the complaint itself, so there is one account of how it
      was resolved.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `${unsafe ? "[UNSAFE VEHICLE] " : ""}Complaint — ${req.reference} — ${
        pb ? pb.tradingAs || pb.companyName : "workshop"
      }`,
      html: shell("A complaint has been lodged", body),
    });
  } catch (err) {
    console.error("complaint lodged email failed", err);
  }
}

/** The customer's receipt. Carl's wording, with the job details filled in. */
export async function sendComplaintConfirmation(
  complaint: Complaint,
  req: QuoteRequest,
  workshopName: string
): Promise<void> {
  const resend = client();
  if (!resend || !req.email) return;

  const vehicle =
    [req.vehicle.make, req.vehicle.model, req.vehicle.year].filter(Boolean).join(" ") ||
    "your vehicle";

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${req.firstName},</p>
    <p style="font-size:15px;line-height:1.5;">
      We have received your complaint. A copy of which has been sent to the repairer. We will be
      dealing with this as a matter of urgency and we will be in touch shortly. Thank you.
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Repairer", workshopName)}
        ${detailRow("Vehicle", vehicle)}
        ${req.vehicle.registration ? detailRow("Registration", req.vehicle.registration) : ""}
        ${detailRow("About", COMPLAINT_CATEGORY_LABEL[complaint.category])}
        ${complaint.media.length ? detailRow("Attached", `${complaint.media.length} file(s)`) : ""}
      </table>
    </div>
    <p style="font-size:13px;color:#6b7f82;margin-bottom:4px;">What you told us:</p>
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;color:#43575a;">${
      complaint.description
    }</p>
    <p style="font-size:13px;color:#6b7f82;">
      Keep this email — the reference above is how we find your complaint if you call us.
    </p>
  `;

  try {
    await resend.emails.send({
      from: fromAddress(),
      to: req.email,
      subject: `We've received your complaint — ${req.reference}`,
      html: shell("Complaint received", body),
    });
  } catch (err) {
    console.error("complaint confirmation email failed", err);
  }
}

// ---------------------------------------------------------------------------
// Additionals — extra work found after stripping a vehicle.
//
// Two recipients, deliberately different letters. The INSURER is being asked to
// approve a cost against a claim, so their copy leads with the claim number and
// itemises the work. The CLIENT is being told their repair is now waiting on
// someone else, so theirs leads with what that means for them — while still
// carrying the full itemised list with amounts: the person whose car it is
// shouldn't have to ask what was requested on their behalf.
// ---------------------------------------------------------------------------

const addNum = (v: number | undefined): number => (Number.isFinite(v) ? Number(v) : 0);

const addMoney = (v: number): string =>
  `R ${addNum(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One additionals line as a table row. The three labour kinds fold into one column. */
function additionalLineRow(l: QuoteLineItem): string {
  const labour = addNum(l.panelAmount) + addNum(l.paintAmount) + addNum(l.stripAmount);
  const hours = addNum(l.panelHours) + addNum(l.paintHours) + addNum(l.stripHours);
  const lineTotal = addNum(l.partsAmount) + labour;
  const cell = "padding:8px 6px;font-size:13px;border-bottom:1px solid rgba(0,132,141,0.10);";
  return `<tr>
    <td style="${cell}">${escapeHtml(l.description)}${
      l.code ? `<span style="color:#6b7f82;font-size:11px;"> · ${escapeHtml(l.code)}</span>` : ""
    }</td>
    <td style="${cell}text-align:right;">${addNum(l.quantity) || 1}</td>
    <td style="${cell}text-align:right;">${l.partsAmount ? addMoney(l.partsAmount) : "—"}</td>
    <td style="${cell}text-align:right;">${labour ? addMoney(labour) : "—"}${
      hours ? `<span style="color:#6b7f82;font-size:11px;"> (${hours}h)</span>` : ""
    }</td>
    <td style="${cell}text-align:right;font-weight:bold;">${addMoney(lineTotal)}</td>
  </tr>`;
}

function additionalTable(add: Additional): string {
  const th =
    "text-align:right;padding:6px;font-size:11px;text-transform:uppercase;color:#6b7f82;";
  return `
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <thead>
      <tr>
        <th style="${th}text-align:left;">Item</th>
        <th style="${th}">Qty</th>
        <th style="${th}">Parts</th>
        <th style="${th}">Labour</th>
        <th style="${th}">Total</th>
      </tr>
    </thead>
    <tbody>${add.lines.map(additionalLineRow).join("")}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;">
    ${detailRow("Parts", addMoney(add.partsTotal))}
    ${add.outWorkTotal ? detailRow("Out work", addMoney(add.outWorkTotal)) : ""}
    ${detailRow("Labour", addMoney(add.labourTotal))}
    ${detailRow("Subtotal (excl VAT)", addMoney(add.subtotal))}
    ${detailRow("VAT", addMoney(add.vat))}
    ${detailRow("<strong>Total (incl VAT)</strong>", `<strong>${addMoney(add.total)}</strong>`)}
  </table>`;
}

const vehicleLine = (req: QuoteRequest): string =>
  [req.vehicle.make, req.vehicle.model, req.vehicle.year].filter(Boolean).join(" ") ||
  "the vehicle";

/**
 * Ask the insurer to approve extra work.
 *
 * Returns whether it actually sent. The caller stamps `sentAt` only on a true —
 * a request that looks sent but never left is worse than one that plainly
 * failed, because nobody goes chasing it.
 */
export async function sendAdditionalsToInsurer(opts: {
  additional: Additional;
  request: QuoteRequest;
  panelBeater: PanelBeater | null;
  to: string;
  contactName?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "Email is not configured" };

  const { additional: add, request: req, panelBeater: pb } = opts;
  const workshop = pb ? pb.tradingAs || pb.companyName : "The repairer";
  const reg = req.vehicle.registration;

  const body = `
    <p style="font-size:15px;line-height:1.5;">${
      opts.contactName ? `Hi ${escapeHtml(opts.contactName)},` : "Hello,"
    }</p>
    <p style="font-size:15px;line-height:1.5;">
      <strong>${escapeHtml(workshop)}</strong> has stripped ${escapeHtml(vehicleLine(req))}
      ${reg ? `(<strong>${escapeHtml(reg)}</strong>)` : ""} and found additional damage that
      was not visible when the original quote was prepared.
      <strong>The repair is on hold pending your approval.</strong>
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow(
          "Claim number",
          add.claimNumber ? escapeHtml(add.claimNumber) : "Not supplied"
        )}
        ${detailRow("Our reference", escapeHtml(req.reference))}
        ${detailRow("Additionals", `#${add.seq}`)}
        ${detailRow("Insured", escapeHtml(`${req.firstName} ${req.lastName}`))}
        ${detailRow("Vehicle", escapeHtml(vehicleLine(req)))}
        ${reg ? detailRow("Registration", escapeHtml(reg)) : ""}
        ${req.vehicle.vin ? detailRow("VIN", escapeHtml(req.vehicle.vin)) : ""}
        ${detailRow("Repairer", escapeHtml(workshop))}
      </table>
    </div>
    ${
      add.reason
        ? `<p style="font-size:15px;line-height:1.5;"><strong>What was found</strong><br/>${escapeHtml(
            add.reason
          ).replace(/\n/g, "<br/>")}</p>`
        : ""
    }
    <h2 style="font-size:16px;margin:22px 0 6px;">Additional work requested</h2>
    ${additionalTable(add)}
    <p style="font-size:13px;color:#6b7f82;line-height:1.5;margin-top:18px;">
      Please confirm approval by reply. Any query on the items above can go directly to
      ${escapeHtml(workshop)}${pb?.phone ? ` on ${escapeHtml(pb.phone)}` : ""}.
    </p>`;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: opts.to,
      subject: `Additionals for approval — ${
        add.claimNumber ? `claim ${add.claimNumber}` : req.reference
      }${reg ? ` · ${reg}` : ""}`,
      html: shell("Additional work needs your approval", body),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    console.error("additionals insurer email failed", err);
    return { sent: false, error: (err as Error).message };
  }
}

/** Tell the client what was found, and that the repair now waits on their insurer. */
export async function sendAdditionalsToClient(opts: {
  additional: Additional;
  request: QuoteRequest;
  panelBeater: PanelBeater | null;
  insurerName?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "Email is not configured" };

  const { additional: add, request: req, panelBeater: pb } = opts;
  if (!req.email) return { sent: false, error: "No client email on this job" };

  const workshop = pb ? pb.tradingAs || pb.companyName : "your repairer";
  const insurer = opts.insurerName || req.insurerName;

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${escapeHtml(req.firstName)},</p>
    <p style="font-size:15px;line-height:1.5;">
      While stripping ${escapeHtml(vehicleLine(req))}, <strong>${escapeHtml(workshop)}</strong>
      found further damage that couldn&rsquo;t be seen before the car came apart. This is
      normal on a repair — it means the original quote didn&rsquo;t cover everything.
    </p>
    <p style="font-size:15px;line-height:1.5;">
      They have sent a request for this extra work
      ${insurer ? `to <strong>${escapeHtml(insurer)}</strong>` : "to your insurer"}
      and are <strong>waiting for approval before carrying on</strong>.
      ${
        insurer
          ? "There is nothing you need to do — but if you want to move it along, your insurer is the one to call."
          : "There is nothing you need to do right now."
      }
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${add.claimNumber ? detailRow("Claim number", escapeHtml(add.claimNumber)) : ""}
        ${detailRow("Your reference", escapeHtml(req.reference))}
        ${detailRow("Vehicle", escapeHtml(vehicleLine(req)))}
        ${
          req.vehicle.registration
            ? detailRow("Registration", escapeHtml(req.vehicle.registration))
            : ""
        }
        ${detailRow("Repairer", escapeHtml(workshop))}
      </table>
    </div>
    ${
      add.reason
        ? `<p style="font-size:15px;line-height:1.5;"><strong>What they found</strong><br/>${escapeHtml(
            add.reason
          ).replace(/\n/g, "<br/>")}</p>`
        : ""
    }
    <h2 style="font-size:16px;margin:22px 0 6px;">What has been requested</h2>
    ${additionalTable(add)}
    <p style="font-size:13px;color:#6b7f82;line-height:1.5;margin-top:18px;">
      These amounts are what the repairer has asked your insurer to approve. What you
      actually pay depends on your policy — your excess is unchanged by this request.
      Any questions about the work itself, speak to ${escapeHtml(workshop)}${
        pb?.phone ? ` on ${escapeHtml(pb.phone)}` : ""
      }.
    </p>`;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: req.email,
      subject: `Extra work found on your repair — ${req.reference}`,
      html: shell("Additional work has been requested", body),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    console.error("additionals client email failed", err);
    return { sent: false, error: (err as Error).message };
  }
}
