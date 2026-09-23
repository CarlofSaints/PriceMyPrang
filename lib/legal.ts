/**
 * The business details the public legal pages (/terms, /privacy, /refunds)
 * print. One place, so the three pages can never disagree about who we are.
 *
 * ECTA section 43 expects a site that sells online to show the full legal
 * name, registration number, physical address, a phone number and an email
 * address, and payment providers (Ozow) check for them. An empty string means
 * "not supplied yet": the pages leave that line out rather than printing a
 * placeholder to the public.
 */
export const LEGAL = {
  tradingName: "Price my Prang",
  legalName: "Price my Prang (Pty) Ltd",
  registrationNumber: "",
  physicalAddress: "",
  contactEmail: "",
  contactPhone: "",
  /** POPIA section 55. Defaults to the company's head if left blank. */
  informationOfficer: "",
  website: "https://www.pricemyprang.co.za",
  /** The price the homepage advertises. Keep the two in step. */
  quoteFee: "R350",
  /** Shown as "Last updated" on all three pages. Bump it when any changes. */
  lastUpdated: "23 September 2026",
} as const;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy & POPIA" },
  { href: "/refunds", label: "Refunds & Cancellations" },
] as const;
