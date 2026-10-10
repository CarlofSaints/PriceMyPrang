import { z } from "zod";

// ---------------------------------------------------------------------------
// Bodies for the panel-beater listing: the public Join form, the portal
// edit/onboard form, staff vetting, and the Add a warranty panel.
//
// Which listing a save lands on, and whether the vetting fields count, is
// decided in lib/workshopAccess.ts, not here: these only say what a caller
// may SEND. The form used to post the whole stored record back (id,
// createdAt, status, every warranty's remindersSent), so it now builds its
// payload explicitly and none of that reaches the server.
// ---------------------------------------------------------------------------

const text = z.string().max(200).optional();
const email = z.string().max(320).optional();
/** The server does Number() on these; an absent or null one keeps what's stored. */
const rate = z.union([z.number(), z.string().max(50)]).nullish();

/**
 * A certificate as the upload hands it back. `pathname` can be "" on a legacy
 * row with only a URL. NEVER-SET: nothing beyond these three.
 */
export const CertificateRef = z.strictObject({
  url: z.string().max(2000),
  pathname: z.string().max(1000),
  contentType: z.string().max(200).optional(),
});

/**
 * One manufacturer warranty. Dates are yyyy-mm-dd, or "" from a cleared date
 * input (mergeWarranties turns "" into undefined).
 * NEVER-SET: remindersSent (which reminder emails already went is the
 * server's record; mergeWarranties carries it over or resets it).
 */
export const WarrantyInput = z.strictObject({
  manufacturer: z.string().max(200),
  startDate: z.string().max(40).optional(),
  expiryDate: z.string().max(40).optional(),
  certificate: CertificateRef.optional(),
  remind: z.boolean().optional(),
});

/** The listing fields a person types into the form, on every path. */
const listingFields = {
  completedByName: text,
  completedByEmail: email,
  ownerName: text,
  ownerEmail: email,
  phone: text,
  companyName: text,
  tradingAs: text,
  companyRegNumber: text,
  vatNumber: text,
  physicalAddress: z.string().max(1000).optional(),
  mibcoNumber: text,
  rmiNumber: text,
  sambraNumber: text,
  miwaNumber: text,
  logoUrl: z.string().max(2000).optional(),
  warranties: z.array(WarrantyInput).max(200).optional(),
  // Not on the form any more (rates live on the Rates page; the quote email
  // falls back to the owner's), but the routes still read them if sent.
  email,
  labourRateSenior: rate,
  labourRateJunior: rate,
};

/**
 * POST /api/panel-beaters/register. PUBLIC, no login.
 * NEVER-SET: id (minted), lat/lng (the server geocodes the address itself),
 * active, status and submittedByPublic (every application starts inactive,
 * pending and public: an applicant can't approve themselves), createdAt,
 * warranties[].remindersSent.
 */
export const PanelBeaterRegisterBody = z.strictObject(listingFields);

/**
 * POST /api/panel-beaters: staff onboarding/editing a listing, or a workshop
 * editing its own.
 *  - `id` names the listing being edited. panelBeaterSaveTarget decides
 *    whether that is allowed; a workshop login always lands on its own.
 *  - `lat`/`lng` come from the "Get coordinates" button, so a person can fix a
 *    pin the geocoder got wrong.
 *  - `active` is the form's "Active (visible to consumers)" tickbox for staff.
 *    vettingFields IGNORES it for a workshop login, which keeps its stored value.
 * NEVER-SET: status and submittedByPublic (approval is PATCH's job, and
 * whether a listing came in through the public form is history, not an
 * edit), createdAt, warranties[].remindersSent.
 */
export const PanelBeaterSaveBody = z.strictObject({
  ...listingFields,
  id: z.string().max(200).optional(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  active: z.boolean().optional(),
});

/**
 * PATCH /api/panel-beaters: approve / decline / switch on or off. STAFF ONLY
 * (manage_panel_beaters, checked in the route), which is why status and active
 * are legitimately settable here and nowhere else.
 * NEVER-SET: submittedByPublic, createdAt, and every listing field (an edit
 * goes through POST).
 */
export const PanelBeaterVettingBody = z.strictObject({
  id: z.string().max(200).optional(),
  status: z.enum(["pending", "approved", "declined"]).optional(),
  active: z.boolean().optional(),
});

/**
 * POST /api/panel-beaters/geocode (the "Get coordinates" button). The cap is
 * deliberately above the route's own 300, so a long address still gets the
 * route's "Address is too long" answer rather than a bare 400.
 * NEVER-SET: nothing else.
 */
export const GeocodeBody = z.strictObject({
  address: z.string().max(5000).optional(),
});

/**
 * POST /api/panel-beaters/warranties: add or replace ONE warranty.
 * `panelBeaterId` is honoured only for manage_panel_beaters; a workshop login
 * is pinned to its own listing whatever it names.
 * NEVER-SET: warranty.remindersSent.
 */
export const WarrantyUpsertBody = z.strictObject({
  panelBeaterId: z.string().max(200).optional(),
  warranty: WarrantyInput.optional(),
});
