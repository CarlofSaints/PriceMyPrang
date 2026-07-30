import { Resend } from "resend";
import type { DevTicket, PanelBeater, QuoteRequest, WarrantyApproval } from "./types";
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

export async function sendUserCredentials(opts: {
  name: string;
  email: string;
  password: string;
  roleName?: string;
  isReset?: boolean;
  mustChangePassword?: boolean;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const loginUrl = `${baseUrl()}/login`;
  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.name},</p>
    <p style="font-size:15px;line-height:1.5;">
      ${
        opts.isReset
          ? "Your Price my Prang portal password has been reset."
          : "An account has been created for you on the Price my Prang portal" +
            (opts.roleName ? ` as <strong>${opts.roleName}</strong>` : "") +
            "."
      }
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Login", opts.email)}
        ${detailRow("Temporary password", opts.password)}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${loginUrl}"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Sign in to the portal
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      ${
        opts.mustChangePassword
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
        ? "Your Price my Prang password was reset"
        : "Your Price my Prang portal login",
      html: shell(opts.isReset ? "Password reset" : "Welcome to Price my Prang", body),
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
  password: string;
  companyName: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not set" };

  const body = `
    <p style="font-size:15px;line-height:1.5;">Hi ${opts.name},</p>
    <p style="font-size:15px;line-height:1.5;">
      Thanks for putting <strong>${opts.companyName}</strong> forward to join our panel. We have
      your application and our team is checking your documents.
    </p>
    <p style="font-size:15px;line-height:1.5;">
      You can sign in straight away to finish setting up your listing and your rates. Until your
      documents have been checked your workshop won&apos;t appear to consumers, and you&apos;ll see a
      reminder in the portal until it does.
    </p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Login", opts.email)}
        ${detailRow("Temporary password", opts.password)}
      </table>
    </div>
    <p style="margin:20px 0;">
      <a href="${baseUrl()}/login"
         style="background:${BRAND.coral};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:14px;">
        Sign in to the portal
      </a>
    </p>
    <p style="font-size:13px;color:#6b7f82;">
      You&apos;ll be asked to choose your own password as soon as you sign in. If you weren&apos;t
      expecting this, you can ignore this email.
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
