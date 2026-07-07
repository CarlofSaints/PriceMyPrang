import { Resend } from "resend";
import type { PanelBeater, QuoteRequest } from "./types";

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
    <p style="font-size:14px;margin-top:16px;">Your selected workshop${chosen.length > 1 ? "s" : ""}:</p>
    <ul style="font-size:14px;padding-left:18px;">${workshops}</ul>
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

  const to = (process.env.ADMIN_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return;

  const photos = req.damagePhotos
    .map(
      (p) =>
        `<a href="${p.url}" style="color:${BRAND.teal};font-size:12px;margin-right:8px;">photo</a>`
    )
    .join("");

  const body = `
    <p style="font-size:15px;">A new quote request has come in and needs assessment.</p>
    <div style="background:${BRAND.offwhite};border-radius:12px;padding:16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Reference", req.reference)}
        ${detailRow("Client", `${req.firstName} ${req.lastName}`)}
        ${detailRow("Email", req.email)}
        ${detailRow("Vehicle", [req.vehicle.make, req.vehicle.model, req.vehicle.year, req.vehicle.colour].filter(Boolean).join(" "))}
        ${detailRow("VIN", req.vehicle.vin || "")}
        ${detailRow("Insurance", req.hasInsurance)}
        ${detailRow("Insurance claim", req.isInsuranceClaim)}
        ${detailRow("3rd party claim", req.isThirdPartyClaim)}
        ${detailRow("Under warranty", req.underWarranty)}
        ${detailRow("Suspected engine damage", req.suspectedEngineDamage)}
        ${detailRow("Quotes requested", String(req.quotesRequested))}
        ${detailRow("Workshops", chosen.map((p) => p.tradingAs || p.companyName).join(", "))}
      </table>
    </div>
    <p style="font-size:13px;">Damage photos: ${photos || "—"}</p>
    ${req.video ? `<p style="font-size:13px;">Video: <a href="${req.video.url}" style="color:${BRAND.teal};">watch</a></p>` : ""}
    ${req.discImage ? `<p style="font-size:13px;">Licence disc: <a href="${req.discImage.url}" style="color:${BRAND.teal};">view</a></p>` : ""}
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

export async function sendPanelBeaterRegistrationNotification(pb: PanelBeater) {
  const resend = client();
  if (!resend) return;

  const to = (process.env.ADMIN_NOTIFY_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
        ${detailRow("MIBCO", pb.mibcoNumber)}
        ${detailRow("RMI", pb.rmiNumber)}
        ${detailRow("SAMBRA", pb.sambraNumber)}
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
