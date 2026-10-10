// Proves the strict request-body schemas for the media, insurer, own-supplier,
// panel-beater and agreement-signing routes.
// Run: npx tsx --test scripts/test-schemas-b.ts
//
// For every schema: what the UI really sends PASSES, an unknown key FAILS, and
// each field a caller must never set FAILS. The passing case is what keeps a
// schema that refuses everything from looking like a secure one.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";
import {
  MediaReadBody,
  UploadFailedBody,
  isAllowedUploadPathname,
} from "../lib/schemas/media";
import {
  InsurerCreateBody,
  InsurerUpdateBody,
  InsurerDeleteBody,
  InsurerContactCreateBody,
  InsurerContactUpdateBody,
} from "../lib/schemas/insurers";
import {
  OwnSupplierCreateBody,
  OwnSupplierUpdateBody,
  OwnSupplierDeleteBody,
} from "../lib/schemas/suppliers-own";
import {
  PanelBeaterRegisterBody,
  PanelBeaterSaveBody,
  PanelBeaterVettingBody,
  WarrantyUpsertBody,
  GeocodeBody,
} from "../lib/schemas/panelBeaters";
import { AgreementSignBody } from "../lib/schemas/agreementSign";

/** Round-trip through JSON, as fetch does: undefined keys disappear. */
const wire = (v: unknown) => JSON.parse(JSON.stringify(v));

function proves(
  name: string,
  schema: z.ZodType,
  good: Record<string, unknown>,
  neverSet: Record<string, unknown>
) {
  test(`${name}: what the UI sends passes`, () => {
    const r = schema.safeParse(wire(good));
    assert.equal(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  });
  test(`${name}: an unknown key fails`, () => {
    assert.equal(schema.safeParse(wire({ ...good, sneaky: 1 })).success, false);
  });
  for (const [key, value] of Object.entries(neverSet)) {
    test(`${name}: never-set "${key}" fails`, () => {
      assert.equal(schema.safeParse(wire({ ...good, [key]: value })).success, false);
    });
  }
}

// ---- media -----------------------------------------------------------------

// QuoteFlow.tsx and PanelBeaterQuoteForm.tsx: { pathname: ref.pathname }.
proves(
  "POST /api/disc/read + /api/odometer/read",
  MediaReadBody,
  { pathname: "requests/tmp/disc/1760000000000-disc-abc123.jpg" },
  { panelBeaterId: "pb1", token: "x" }
);

// lib/uploadError.ts reportUploadFailure().
proves(
  "POST /api/media/upload-failed",
  UploadFailedBody,
  {
    context: "the Join the panel form",
    label: "Toyota warranty certificate",
    fileName: "cert.pdf",
    contentType: "application/pdf",
    sizeBytes: 812345,
    reason: "Vercel Blob: Content type mismatch",
    name: "Thandi M",
    email: "thandi@example.co.za",
    company: "Thandi Panel Works",
  },
  { reportedBy: "server", identity: "session", actorKind: "user" }
);

test("POST /api/media/upload-failed: a signed-in report with no typed details passes", () => {
  const r = UploadFailedBody.safeParse(
    wire({ context: "the Add a warranty panel", label: "a warranty certificate", reason: "boom" })
  );
  assert.equal(r.success, true);
});

test("media/upload: the three anonymous upload prefixes are allowed", () => {
  // QuoteFlow / PanelBeaterQuoteForm, PanelBeaterForm / AddWarrantyPanel, FeedbackFlow.
  assert.equal(isAllowedUploadPathname("requests/tmp/disc/1-a.jpg"), true);
  assert.equal(isAllowedUploadPathname("panel-beaters/certificates/1-cert.pdf"), true);
  assert.equal(isAllowedUploadPathname("panel-beaters/logos/1-logo.png"), true);
  assert.equal(isAllowedUploadPathname("complaints/PMP-1234/1-photo.jpg"), true);
});

test("media/upload: every other location is refused", () => {
  for (const p of [
    "dev-tickets/1/secret.pdf",
    "agreements/signed/abc.pdf",
    "quotes/abc.pdf",
    "data/users.json",
    "requests/../dev-tickets/x.pdf",
    "/requests/x.jpg",
    "",
  ])
    assert.equal(isAllowedUploadPathname(p), false, p);
});

// ---- insurers ----------------------------------------------------------------

// InsurersManager.tsx addInsurer().
proves("POST /api/insurers", InsurerCreateBody, { name: "Santam" }, {
  id: "santam_abc123",
  active: false,
  createdAt: "2026-01-01T00:00:00.000Z",
});

// InsurersManager.tsx patch(id, { name }) and patch(id, { active }).
proves("PATCH /api/insurers (rename)", InsurerUpdateBody, { id: "santam_abc123", name: "Santam Ltd" }, {
  createdAt: "2026-01-01T00:00:00.000Z",
});
proves("PATCH /api/insurers (switch off)", InsurerUpdateBody, { id: "santam_abc123", active: false }, {
  createdAt: "2026-01-01T00:00:00.000Z",
});

// InsurersManager.tsx deleteInsurer().
proves("DELETE /api/insurers", InsurerDeleteBody, { id: "santam_abc123" }, {
  name: "Santam",
  active: false,
});

// InsurerContacts.tsx add(): { insurerId, generic, ...form }.
proves(
  "POST /api/insurers/contacts",
  InsurerContactCreateBody,
  {
    insurerId: "santam_abc123",
    generic: false,
    name: "Jo Assessor",
    role: "Assessor",
    email: "jo@santam.co.za",
    phone: "021 555 0100",
    notes: "",
  },
  { panelBeaterId: "workshop-b", id: "c1", createdAt: "2026-01-01T00:00:00.000Z" }
);

// No UI caller today: the shape the route reads.
proves(
  "PATCH /api/insurers/contacts",
  InsurerContactUpdateBody,
  { id: "c1", name: "Jo Assessor", role: "Senior assessor", email: "", phone: "", notes: "x" },
  { panelBeaterId: "workshop-b", insurerId: "other", generic: true, createdAt: "2026" }
);

// ---- own suppliers -------------------------------------------------------------

// MySuppliers.tsx BLANK / draftFrom().
const supplierDraft = {
  name: "Auto Parts Co",
  companyRegNumber: "2001/123456/07",
  vatNumber: "4123456789",
  address: "1 Main Rd, Cape Town",
  phone: "021 555 0101",
  mainContactName: "Sam",
  mainContactPhone: "082 555 0102",
  mainContactEmail: "sam@parts.co.za",
  billingContactName: "",
  billingContactPhone: "",
  billingContactEmail: "",
  supplies: "Toyota body panels",
};
const supplierNeverSet = {
  createdAt: "2026-01-01T00:00:00.000Z",
  active: false,
  partTypes: ["new"],
  makes: ["All"],
};

proves("POST /api/my-suppliers (supplier page)", OwnSupplierCreateBody, supplierDraft, {
  id: "s1",
  ...supplierNeverSet,
});
// QuoteBuilder.tsx addSupplier(): staff adding mid-quote on a workshop's behalf.
proves(
  "POST /api/my-suppliers (quote builder)",
  OwnSupplierCreateBody,
  { name: "Auto Parts Co", panelBeaterId: "workshop-a" },
  { id: "s1", ...supplierNeverSet }
);
proves("PATCH /api/my-suppliers", OwnSupplierUpdateBody, { id: "s1", ...supplierDraft }, {
  panelBeaterId: "workshop-b",
  ...supplierNeverSet,
});
proves("DELETE /api/my-suppliers", OwnSupplierDeleteBody, { id: "s1" }, {
  panelBeaterId: "workshop-b",
});

// ---- panel beaters ---------------------------------------------------------------

const certificate = {
  url: "/api/media/panel-beaters/certificates/1-cert.pdf",
  pathname: "panel-beaters/certificates/1-cert.pdf",
  contentType: "application/pdf",
};
const warranty = {
  manufacturer: "Toyota",
  startDate: "2026-01-01",
  expiryDate: "",
  certificate,
  remind: true,
};

// PanelBeaterForm.tsx payload(), the fields every mode sends.
const listing = {
  completedByName: "Thandi M",
  completedByEmail: "thandi@example.co.za",
  ownerName: "Sipho M",
  ownerEmail: "sipho@example.co.za",
  phone: "021 555 0103",
  companyName: "Thandi Panel Works (Pty) Ltd",
  tradingAs: "Thandi Panel Works",
  companyRegNumber: "2010/000001/07",
  vatNumber: "",
  physicalAddress: "12 Voortrekker Rd, Bellville, Cape Town",
  mibcoNumber: "M123",
  rmiNumber: "R456",
  sambraNumber: "",
  miwaNumber: "",
  logoUrl: "/api/media/panel-beaters/logos/1-logo.png",
  warranties: [warranty],
};
const remindersSent = [{ ...warranty, remindersSent: ["3m"] }];

// PanelBeaterForm in mode "public" (RegisterLauncher.tsx).
proves("POST /api/panel-beaters/register", PanelBeaterRegisterBody, listing, {
  id: "pb-planted",
  lat: -33.9,
  lng: 18.6,
  active: true,
  status: "approved",
  submittedByPublic: false,
  createdAt: "2020-01-01T00:00:00.000Z",
  warranties: remindersSent,
});

// PanelBeaterForm in mode "admin": the edit page and the onboard page.
proves(
  "POST /api/panel-beaters (edit)",
  PanelBeaterSaveBody,
  { ...listing, id: "pb1", lat: -33.9, lng: 18.6, active: true },
  {
    status: "approved",
    submittedByPublic: false,
    createdAt: "2020-01-01T00:00:00.000Z",
    warranties: remindersSent,
  }
);

test("POST /api/panel-beaters (new, never located): no id or coordinates passes", () => {
  const r = PanelBeaterSaveBody.safeParse(wire({ ...listing, warranties: [], active: true }));
  assert.equal(r.success, true);
});

test("a warranty certificate with an extra key fails (nested objects are strict too)", () => {
  const r = PanelBeaterSaveBody.safeParse(
    wire({ ...listing, warranties: [{ ...warranty, certificate: { ...certificate, size: 1 } }] })
  );
  assert.equal(r.success, false);
});

// PanelBeaterApproval.tsx: { id, status }. Staff only, so status/active are allowed.
proves(
  "PATCH /api/panel-beaters",
  PanelBeaterVettingBody,
  { id: "pb1", status: "approved" },
  { submittedByPublic: true, createdAt: "2020", companyName: "Renamed" }
);

test("PATCH /api/panel-beaters: an unknown status fails", () => {
  assert.equal(PanelBeaterVettingBody.safeParse({ id: "pb1", status: "vip" }).success, false);
});

// AddWarrantyPanel.tsx save().
proves(
  "POST /api/panel-beaters/warranties",
  WarrantyUpsertBody,
  { panelBeaterId: "pb1", warranty: { ...warranty, expiryDate: undefined } },
  { warranty: { ...warranty, remindersSent: ["3m"] } }
);

// PanelBeaterForm.tsx getCoordinates().
proves(
  "POST /api/panel-beaters/geocode",
  GeocodeBody,
  { address: "12 Voortrekker Rd, Bellville, Cape Town" },
  { lat: -33.9, key: "x" }
);

test("POST /api/panel-beaters/geocode: a 301-char address still reaches the route's own check", () => {
  assert.equal(GeocodeBody.safeParse({ address: "x".repeat(301) }).success, true);
});

// ---- agreement -------------------------------------------------------------------

// AgreementSigner.tsx sign().
proves(
  "POST /api/public/agreement/sign",
  AgreementSignBody,
  { token: "tok_abc", signerName: "Sipho M", signerTitle: "Director", accepted: true },
  {
    signedAt: "2020-01-01T00:00:00.000Z",
    signerIp: "1.2.3.4",
    signerUserAgent: "x",
    panelBeaterId: "pb-other",
    documentId: "d1",
    signedPdfUrl: "/x.pdf",
  }
);

test("media paths: a double dot inside a file name is fine, a .. segment is not", () => {
  // safeFileName keeps dots, so a customer's "photo..jpg" must still upload.
  assert.equal(isAllowedUploadPathname("requests/tmp/damage/1-photo..jpg"), true);
  assert.equal(isAllowedUploadPathname("complaints/PMP-1/1-a...b.png"), true);
  for (const p of [
    "requests/../dev-tickets/x.pdf",
    "requests/./x.jpg",
    "requests//x.jpg",
    String.raw`requests\..\dev-tickets\x`,
  ])
    assert.equal(isAllowedUploadPathname(p), false, p);
});
