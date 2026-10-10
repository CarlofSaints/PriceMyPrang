// Proves the strict request schemas for the public, requests, quotes, rate
// card, roles, suppliers, users and seed routes.
// Run: npx tsx --test scripts/test-schemas-c.ts
//
// For every schema: a payload copied from what the UI actually posts PASSES,
// the same payload plus an unknown key FAILS, and the same payload plus each
// field a caller must never set FAILS. The first case is the one that matters
// most: a schema that refuses everything would pass the other two.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";
import {
  FeedbackBody,
  FeedbackLinkBody,
  ForgotPasswordBody,
  PayBody,
  AcceptQuoteBody,
  SetPasswordBody,
} from "../lib/schemas/public";
import {
  CreateRequestBody,
  ConsumerRequestBody,
  RepairerRequestBody,
  UpdateRequestBody,
} from "../lib/schemas/requests";
import { BuildQuoteBody } from "../lib/schemas/quotes";
import { SaveRateCardBody, CreateCustomRateTypeBody } from "../lib/schemas/rateCards";
import { CreateRoleBody, UpdateRoleBody, DeleteRoleBody } from "../lib/schemas/roles";
import {
  CreateSupplierBody,
  UpdateSupplierBody,
  DeleteSupplierBody,
} from "../lib/schemas/suppliers";
import { CreateUserBody, UpdateUserBody } from "../lib/schemas/users";
import { SeedBody } from "../lib/schemas/seed";

/** The three checks every schema gets. */
function prove(
  name: string,
  schema: z.ZodType,
  good: Record<string, unknown>,
  neverSet: Record<string, unknown>
) {
  test(`${name}: what the UI sends passes`, () => {
    const r = schema.safeParse(good);
    assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
  });
  test(`${name}: an unknown key fails`, () => {
    assert.equal(schema.safeParse({ ...good, somethingElse: "x" }).success, false);
  });
  for (const [key, value] of Object.entries(neverSet)) {
    test(`${name}: never-set "${key}" fails`, () => {
      assert.equal(schema.safeParse({ ...good, [key]: value }).success, false);
    });
  }
}

// ---------------------------------------------------------------------------
// Media refs exactly as uploadFile() in the forms builds them.
const media = (name: string) => ({
  url: `/api/media?p=requests%2Ftmp%2F${name}`,
  pathname: `requests/tmp/${name}`,
  contentType: "image/jpeg",
});

// /api/disc/read's answer, which QuoteFlow posts back untouched.
const vehicleFromDisc = {
  vin: "AHTFR22G406012345",
  make: "TOYOTA",
  model: "HILUX",
  series: "2.4 GD-6",
  year: "2019",
  colour: "WHITE",
  registration: "CA 123-456",
  discRawText: "REPUBLIC OF SOUTH AFRICA ...",
};

// QuoteFlow submit(): { ...form, vehicle, discImage, odometerImage, video,
// requiredPhotos, damagePhotos }.
const consumerForm = {
  firstName: "Thandi",
  lastName: "Mokoena",
  email: "thandi@example.co.za",
  phone: "082 555 0101",
  companyName: "",
  hasInsurance: "yes",
  insurerName: "Santam",
  insurerId: "ins_santam",
  underWarranty: "unsure",
  isInsuranceClaim: "yes",
  claimNumber: "",
  noClaimNumberYet: true,
  isThirdPartyClaim: "no",
  suspectedEngineDamage: "no",
  mileageKm: "84500",
  town: "Durbanville",
  province: "Western Cape",
  vehicle: vehicleFromDisc,
  discImage: media("disc/1-disc.jpg"),
  odometerImage: media("odometer/1-odo.jpg"),
  video: null,
  requiredPhotos: {
    front: media("side-front/1-f.jpg"),
    back: media("side-back/1-b.jpg"),
    left: media("side-left/1-l.jpg"),
    right: media("side-right/1-r.jpg"),
  },
  damagePhotos: [media("damage/1-a.jpg"), media("damage/2-b.jpg")],
};

const requestNeverSet = {
  reference: "PMP-20261010-MOKOENA-01",
  publicToken: "tok",
  status: "completed",
  createdAt: "2026-10-10T00:00:00Z",
  quotes: [],
  letUsChoose: false,
  quotesRequested: 3,
  repairerInitiated: true,
  location: { lat: 0, lng: 0 },
  nearestPanelBeaterKm: 1,
  paid: true,
  paidAt: "2026-10-10T00:00:00Z",
  paymentStatus: "paid",
  paymentReference: "ozow-1",
  amount: 0,
};

prove("POST /api/requests (consumer)", ConsumerRequestBody, consumerForm, {
  ...requestNeverSet,
  selectedPanelBeaterIds: ["pb_1"],
  rateCardId: "card_1",
});
prove("POST /api/requests (consumer, via the union)", CreateRequestBody, consumerForm, {
  ...requestNeverSet,
  selectedPanelBeaterIds: ["pb_1"],
  rateCardId: "card_1",
});

test("POST /api/requests (consumer): a video and no disc text still pass", () => {
  const r = CreateRequestBody.safeParse({
    ...consumerForm,
    vehicle: {},
    video: { url: "/api/media?p=x", pathname: "requests/tmp/video/1-video.webm", contentType: "video/webm" },
    mileageKm: 84500,
  });
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
});

test("POST /api/requests (consumer): an unknown key inside a photo fails", () => {
  const r = CreateRequestBody.safeParse({
    ...consumerForm,
    damagePhotos: [{ ...media("damage/1.jpg"), size: 12 }],
  });
  assert.equal(r.success, false);
});

test("POST /api/requests (consumer): an unknown key inside the vehicle fails", () => {
  const r = CreateRequestBody.safeParse({
    ...consumerForm,
    vehicle: { ...vehicleFromDisc, mmCode: "123" },
  });
  assert.equal(r.success, false);
});

// QuoteFlow submitRepairer(): the consumer payload plus repairerQuote and the
// workshop, with town/province left as typed (often "").
const repairerFlow = {
  ...consumerForm,
  town: "",
  province: "",
  repairerQuote: true,
  selectedPanelBeaterIds: ["pb_1"],
};

// PanelBeaterQuoteForm submit(), as built after this change.
const repairerIntake = {
  repairerQuote: true,
  selectedPanelBeaterIds: ["pb_1"],
  firstName: "Johan",
  lastName: "Botha",
  companyName: "Botha Transport",
  email: "johan@example.co.za",
  phone: "021 555 0101",
  rateCardId: "card_1",
  underWarranty: "no",
  isThirdPartyClaim: "yes",
  hasInsurance: "no",
  isInsuranceClaim: "no",
  suspectedEngineDamage: "no",
  vehicle: { make: "Isuzu", model: "D-Max", year: "2021", registration: "CY 1" },
  mileageKm: "120000",
  odometerImage: null,
  discImage: null,
  requiredPhotos: {
    front: media("sides/front/1.jpg"),
    back: media("sides/back/1.jpg"),
    left: media("sides/left/1.jpg"),
    right: media("sides/right/1.jpg"),
  },
  damagePhotos: [],
};

prove("POST /api/requests (repairer, QuoteFlow)", CreateRequestBody, repairerFlow, requestNeverSet);
prove("POST /api/requests (repairer intake form)", RepairerRequestBody, repairerIntake, requestNeverSet);
prove("POST /api/requests (repairer intake form, via the union)", CreateRequestBody, repairerIntake, requestNeverSet);

prove(
  "PATCH /api/requests/[reference] (status)",
  UpdateRequestBody,
  { status: "in_progress" },
  { reference: "PMP-1", quotes: [], publicToken: "t", email: "a@b.c", createdAt: "x" }
);
prove(
  "PATCH /api/requests/[reference] (workshops)",
  UpdateRequestBody,
  { panelBeaterIds: ["pb_1", "pb_2"] },
  { selectedPanelBeaterIds: ["pb_1"], quotes: [] }
);

// ---------------------------------------------------------------------------
// QuoteBuilder build(): lines straight from state, one fresh and one reloaded
// from a saved quote (toQuote in lib/store.ts), plus a rate-card quick line.
const freshLine = {
  code: "",
  description: "Front bumper",
  quantity: 1,
  partsAmount: 0,
  panelAmount: 0,
  panelHours: 0,
  paintAmount: 0,
  paintHours: 0,
  stripAmount: 0,
  stripHours: 0,
};
const savedLine = {
  code: "New",
  description: "Headlamp L/H",
  quantity: 1,
  partsCost: 2100,
  partsAmount: 2520,
  partId: "part_1",
  supplierId: "sup_1",
  supplier: "Midas Bellville",
  partNumber: "81150-0K010",
  panelCode: "R",
  panelAmount: 450,
  panelHours: 1,
  paintCode: "P",
  paintAmount: 900,
  paintHours: 2,
  stripCode: "S",
  stripAmount: 225,
  stripHours: 0.5,
};
const quickLine = { ...freshLine, description: "Towing", partsAmount: 850 };

prove(
  "POST /api/quotes",
  BuildQuoteBody,
  {
    reference: "PMP-20261010-MOKOENA-01",
    panelBeaterId: "pb_1",
    lines: [freshLine, savedLine, quickLine],
    sundries: 5,
    sundriesMode: "percent",
    consumables: 150,
    notes: "",
  },
  {
    id: "q_1",
    status: "accepted",
    acceptedAt: "2026-10-10",
    pdfUrl: "https://x",
    createdAt: "2026-10-10",
    createdByName: "Me",
    estimatorName: "Me",
    sundriesPercent: 5,
    partsTotal: 1,
    outWorkTotal: 1,
    panelTotal: 1,
    paintTotal: 1,
    stripTotal: 1,
    labourTotal: 1,
    totalHours: 1,
    subtotal: 1,
    vat: 1,
    total: 1,
  }
);

test("POST /api/quotes: an unknown key on a LINE fails", () => {
  const r = BuildQuoteBody.safeParse({
    reference: "PMP-1",
    panelBeaterId: "pb_1",
    lines: [{ ...savedLine, quoteId: "q_1" }],
  });
  assert.equal(r.success, false);
});

// ---------------------------------------------------------------------------
// RatesEditor save() and addCustomType().
prove(
  "POST /api/rate-cards",
  SaveRateCardBody,
  {
    id: "card_1",
    panelBeaterId: "pb_1",
    kind: "insurance",
    insurerName: "Hollard",
    aluminium: false,
    values: {
      general: { markup_oem: 25, "custom:abc": 300 },
      out_of_warranty: { labour_rate: 450, paint_rate: 480 },
      in_warranty: {},
    },
  },
  { createdAt: "2026-10-10", updatedAt: "2026-10-10" }
);
test("POST /api/rate-cards: an unknown rate block fails", () => {
  assert.equal(
    SaveRateCardBody.safeParse({ kind: "cash", values: { platinum: { labour_rate: 1 } } }).success,
    false
  );
});

prove(
  "POST /api/rate-cards/custom-types",
  CreateCustomRateTypeBody,
  { panelBeaterId: "pb_1", label: "Diamond cut rim repair", unit: "rand" },
  { id: "ct_1", createdAt: "2026-10-10" }
);

// ---------------------------------------------------------------------------
// RolesManager.
prove(
  "POST /api/roles",
  CreateRoleBody,
  { name: "Estimator", permissions: [] },
  { id: "estimator_abc", system: true }
);
prove(
  "PATCH /api/roles",
  UpdateRoleBody,
  { id: "estimator_abc", permissions: ["view_dashboard", "build_quotes"] },
  { system: true, scope: "platform" }
);
prove("DELETE /api/roles", DeleteRoleBody, { id: "estimator_abc" }, { system: true, name: "x" });

// ---------------------------------------------------------------------------
// SuppliersManager.
prove(
  "POST /api/suppliers",
  CreateSupplierBody,
  {
    name: "Midas Bellville",
    partTypes: ["new", "alternate"],
    makes: ["Toyota", "All"],
    supplies: "",
    email: "",
    phone: "021 555 0101",
  },
  { id: "midas_abc", panelBeaterId: "pb_1", active: false, createdAt: "2026-10-10" }
);
prove(
  "PATCH /api/suppliers",
  UpdateSupplierBody,
  { id: "midas_abc", active: false },
  { panelBeaterId: "pb_1", createdAt: "2026-10-10" }
);
prove("DELETE /api/suppliers", DeleteSupplierBody, { id: "midas_abc" }, { panelBeaterId: "pb_1" });

// ---------------------------------------------------------------------------
// UsersManager: create() posts the whole form; each PATCH sends one control.
prove(
  "POST /api/users",
  CreateUserBody,
  {
    name: "Sipho Dlamini",
    email: "sipho@example.co.za",
    password: "a-temporary-one",
    role: "estimator_abc",
    panelBeaterId: "",
    sendEmail: true,
    mustChangePassword: true,
  },
  {
    id: "u_1",
    passwordHash: "x",
    active: false,
    emailVerifiedAt: "2026-10-10",
    twoFactorEnabled: false,
    createdAt: "2026-10-10",
    permissions: ["manage_panel_beaters"],
  }
);
for (const control of [
  { role: "admin" },
  { active: false },
  { twoFactorEnabled: true },
  { welcome: true },
  { resetLink: true },
  { password: "a-new-one-123", sendEmail: false, mustChangePassword: true },
]) {
  prove(
    `PATCH /api/users (${Object.keys(control).join("+")})`,
    UpdateUserBody,
    { id: "u_1", ...control },
    {
      passwordHash: "x",
      emailVerifiedAt: "2026-10-10",
      email: "x@y.z",
      name: "x",
      panelBeaterId: "pb_2",
      permissions: ["manage_panel_beaters"],
    }
  );
}

// ---------------------------------------------------------------------------
// The public routes.
prove(
  "POST /api/public/feedback/[token] (rating)",
  FeedbackBody,
  { kind: "rating", score: 4, comment: "Quick and tidy", panelBeaterId: "pb_1" },
  { requestId: "r_1", submittedIp: "1.2.3.4", status: "new" }
);
prove(
  "POST /api/public/feedback/[token] (rating, no earlier comment)",
  FeedbackBody,
  { kind: "rating", score: 5, comment: null, panelBeaterId: "pb_1" },
  { requestId: "r_1" }
);
prove(
  "POST /api/public/feedback/[token] (complaint)",
  FeedbackBody,
  {
    kind: "complaint",
    category: "paint",
    description: "The colour doesn't match.",
    vehicleSafety: "safe",
    desiredOutcome: "rework",
    collectedOn: "2026-10-01",
    problemNoticedOn: "2026-10-03",
    stillWithRepairer: false,
    raisedWithRepairer: true,
    media: [
      { url: "/api/media?p=c1", pathname: "complaints/PMP-1/1-a.jpg", contentType: "image/jpeg", isVideo: false },
      { url: "/api/media?p=c2", pathname: "complaints/PMP-1/2-b.mp4", isVideo: true },
    ],
    panelBeaterId: "pb_1",
  },
  {
    requestId: "r_1",
    status: "resolved",
    submittedIp: "1.2.3.4",
    submittedUserAgent: "x",
    id: "c_1",
  }
);
test("POST /api/public/feedback/[token]: an unknown key on a media item fails", () => {
  const r = FeedbackBody.safeParse({
    kind: "complaint",
    description: "x",
    panelBeaterId: "pb_1",
    media: [{ url: "u", pathname: "p", isVideo: false, size: 1 }],
  });
  assert.equal(r.success, false);
});

prove(
  "POST /api/public/feedback/request-link",
  FeedbackLinkBody,
  { reference: "PMP-20261010-MOKOENA-01" },
  { email: "attacker@example.com", requestId: "r_1", token: "t" }
);
prove(
  "POST /api/public/forgot-password",
  ForgotPasswordBody,
  { email: "thandi@example.co.za" },
  { userId: "u_1", token: "t", purpose: "welcome" }
);
prove(
  "POST /api/public/pay",
  PayBody,
  { token: "5b0c6c2e-0d1a-4c55-9f4a-1d2f3a4b5c6d" },
  { amount: 1, requestId: "r_1", status: "paid", successUrl: "https://evil.example" }
);
prove(
  "POST /api/public/quotes/accept",
  AcceptQuoteBody,
  { token: "5b0c6c2e-0d1a-4c55-9f4a-1d2f3a4b5c6d", quoteId: "q_1" },
  { status: "accepted", acceptedAt: "2026-10-10", requestId: "r_1", panelBeaterId: "pb_1" }
);
prove(
  "POST /api/public/set-password",
  SetPasswordBody,
  { token: "5b0c6c2e-0d1a-4c55-9f4a-1d2f3a4b5c6d", password: "correct horse battery" },
  { userId: "u_1", email: "x@y.z", passwordHash: "x", mustChangePassword: false }
);

// ---------------------------------------------------------------------------
// The seed endpoint (curl only).
prove(
  "POST /api/seed",
  SeedBody,
  { secret: "s", name: "Carl", email: "carl@example.co.za", password: "a-long-password" },
  {
    role: "panel_beater",
    id: "u_1",
    passwordHash: "x",
    active: false,
    createdAt: "2026-10-10",
    panelBeaterId: "pb_1",
  }
);
