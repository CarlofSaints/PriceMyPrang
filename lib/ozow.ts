// ---------------------------------------------------------------------------
// Ozow One API: the customer's fee.
//
// WHICH CONTRACT. Ozow has two. The old Payments API (a form posted to
// pay.ozow.com with a SHA512 "HashCheck") is legacy and gets no new features.
// This is One API: an OAuth client-credentials token, a JSON payment request
// that hands back a redirect URL, and Svix-signed webhooks. If you find
// yourself computing a hash here, you are on the wrong contract.
// Docs: https://hub.ozow.com/bundles/take-a-payment-full.md
//
// NOTHING ABOUT THE CUSTOMER'S BANK EVER REACHES US. They pay on Ozow's own
// page; we only ever learn an outcome.
//
// ENV (all server-side, set on Vercel as Sensitive):
//   OZOW_CLIENT_ID, OZOW_CLIENT_SECRET  Dashboard > One API Clients
//   OZOW_SITE_CODE                      Dashboard > Sites
//   OZOW_WEBHOOK_SECRET                 whsec_..., the webhook's own secret
//   OZOW_ENV                            "production" to take real money.
//                                       Anything else, or unset, is staging:
//                                       a missing setting must never charge.
//   PMP_REQUEST_FEE                     rand, default 350
// ---------------------------------------------------------------------------

export type OzowEnv = "production" | "staging";

const BASE: Record<OzowEnv, string> = {
  production: "https://one.ozow.com/v1",
  staging: "https://stagingone.ozow.com/v1",
};

export interface OzowConfig {
  env: OzowEnv;
  base: string;
  clientId: string;
  clientSecret: string;
  siteCode: string;
}

/**
 * The credentials, or null when payments are not switched on. Null is a real
 * state, not an error: until the keys are pasted in, requests go through
 * unpaid exactly as they did before Ozow existed.
 */
export function ozowConfig(): OzowConfig | null {
  const clientId = process.env.OZOW_CLIENT_ID?.trim();
  const clientSecret = process.env.OZOW_CLIENT_SECRET?.trim();
  const siteCode = process.env.OZOW_SITE_CODE?.trim();
  if (!clientId || !clientSecret || !siteCode) return null;
  const env: OzowEnv = process.env.OZOW_ENV?.trim().toLowerCase() === "production" ? "production" : "staging";
  return { env, base: BASE[env], clientId, clientSecret, siteCode };
}

/** What a customer pays per request, in rand. */
export function requestFee(): number {
  const n = Number(process.env.PMP_REQUEST_FEE);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 350;
}

/** Ozow answered with an error. `detail` is Ozow's own words, for the log. */
export class OzowError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string,
    public correlationId?: string
  ) {
    super(`Ozow ${status} ${code}: ${detail}`);
  }
}

async function ozowFetch(cfg: OzowConfig, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${cfg.base}${path}`, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = (body ?? {}) as { code?: string; detail?: string; title?: string; error?: string };
    throw new OzowError(
      res.status,
      b.code || b.error || String(res.status),
      b.detail || b.title || (typeof body === "string" ? body.slice(0, 300) : "no detail"),
      res.headers.get("x-correlation-id") ?? undefined
    );
  }
  return body;
}

// A token lasts hours; asking for one per call would double every round trip.
// Per instance, which is fine: a cold instance just asks again.
let cachedToken: { key: string; value: string; expiresAt: number } | null = null;

async function accessToken(cfg: OzowConfig): Promise<string> {
  const key = `${cfg.env}:${cfg.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const body = (await ozowFetch(cfg, "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "payments",
      grant_type: "client_credentials",
    }),
  })) as { access_token?: string; expires_in?: string | number };
  if (!body?.access_token) throw new OzowError(500, "NoToken", "token response carried no access_token");

  // Read the lifetime rather than assume it, and renew a minute early.
  const seconds = Number(body.expires_in) || 3600;
  cachedToken = { key, value: body.access_token, expiresAt: Date.now() + (seconds - 60) * 1000 };
  return body.access_token;
}

export interface CreatedPayment {
  id: string;
  status: string;
  redirectUrl?: string;
}

export async function createOzowPayment(
  cfg: OzowConfig,
  p: {
    amount: number;
    /** Ours. Pre-filled as the payer's own reference at their bank. Max 50. */
    merchantReference: string;
    /** On OUR bank statement. Letters and digits only, max 20. */
    beneficiaryReference: string;
    returnUrl: string;
    expireAt: Date;
    payer?: { id: string; name: string; email?: string };
    /** Our payment row's id, so a retried POST can't create two. */
    idempotencyKey: string;
  }
): Promise<CreatedPayment> {
  const token = await accessToken(cfg);
  const body = (await ozowFetch(cfg, "/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": p.idempotencyKey,
    },
    body: JSON.stringify({
      siteCode: cfg.siteCode,
      region: "ZA",
      amount: { currency: "ZAR", value: p.amount },
      merchantReference: p.merchantReference.slice(0, 50),
      beneficiaryReference: p.beneficiaryReference.replace(/[^A-Za-z0-9]/g, "").slice(0, 20),
      expireAt: p.expireAt.toISOString(),
      returnUrl: p.returnUrl,
      ...(p.payer ? { payer: p.payer } : {}),
    }),
  })) as CreatedPayment;
  if (!body?.id) throw new OzowError(500, "NoPaymentId", "payment response carried no id");
  return body;
}

/** One of Ozow's transactions behind a payment request. */
export interface OzowTransaction {
  id: string;
  merchantReference: string;
  /** Incomplete | Successful | Error | Pending | Refunded. Compare without case. */
  status: string;
  reason?: string;
  amount?: { currency: string; value: number };
  createdDate: string;
  completedDate?: string;
}

/**
 * Every transaction Ozow holds for one payment request. THIS is the truth
 * about whether someone paid: the browser coming back proves nothing, and a
 * webhook is only a prompt to come and ask here.
 *
 * An id Ozow doesn't know answers 200 with an empty list, not 404.
 */
export async function listOzowTransactions(
  cfg: OzowConfig,
  paymentId: string,
  since: Date
): Promise<OzowTransaction[]> {
  const token = await accessToken(cfg);
  // Whole days only, inclusive. A day either side so a payment made just
  // after midnight (UTC vs SAST) is never outside the window.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(since.getTime() - 86_400_000);
  const to = new Date(Date.now() + 86_400_000);
  const qs = new URLSearchParams({ fromDate: day(from), toDate: day(to), limit: "50" });
  const body = (await ozowFetch(cfg, `/payments/${encodeURIComponent(paymentId)}/transactions?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  })) as { results?: OzowTransaction[] };
  return body?.results ?? [];
}
