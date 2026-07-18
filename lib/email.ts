import { Resend } from "resend";
import type { PanelBeater, QuoteRequest, WarrantyApproval } from "./types";
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
      Please sign in and change your password. If you weren&apos;t expecting this, you can ignore this email.
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

export async function sendPanelBeaterRegistrationNotification(pb: PanelBeater) {
  const resend = client();
  if (!resend) return;

  const to = await notifyRecipients();
  if (to.length === 0) return;

  const body = `
    <p style="font-size:15px;">A panel beater has applied to join Price my Prang and is awaiting approval.</p>
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
