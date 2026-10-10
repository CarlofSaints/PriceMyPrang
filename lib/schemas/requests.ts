import { z } from "zod";

// Request bodies for /api/requests*. See lib/validate.ts for why every object
// here is strict.
//
// POST /api/requests is the LIVE consumer quote form (components/QuoteFlow.tsx)
// plus two repairer walk-in forms (QuoteFlow in repairer mode, and
// components/PanelBeaterQuoteForm.tsx). The shapes below are what those three
// actually post, field for field: a key missing here turns a paying customer
// into a 400, so change the form and this file together.

/** A blob the browser uploaded, as lib/types MediaRef. */
const MediaRef = z.strictObject({
  url: z.string().max(2000),
  pathname: z.string().max(1000),
  contentType: z.string().max(200).optional(),
});

/**
 * What /api/disc/read returns, posted back as-is by the consumer form, and
 * typed into by the repairer form.
 */
const Vehicle = z.strictObject({
  vin: z.string().max(200).optional(),
  make: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  series: z.string().max(200).optional(),
  year: z.string().max(200).optional(),
  colour: z.string().max(200).optional(),
  registration: z.string().max(200).optional(),
  discRawText: z.string().max(20000).optional(),
});

const RequiredPhotos = z.strictObject({
  front: MediaRef.optional(),
  back: MediaRef.optional(),
  left: MediaRef.optional(),
  right: MediaRef.optional(),
});

const name = z.string().max(200);
// Required: these are non-null enum columns (prisma YesNo / YesNoUnsure), so a
// blank answer could never be saved; it used to fail at the insert as a 500.
const yesNo = z.enum(["yes", "no"]);

/**
 * The fields both kinds of submission share. The four names are optional so
 * the route's own "Missing required fields" reply still fires.
 */
const common = {
  firstName: name.optional(),
  lastName: name.optional(),
  email: z.string().max(320).optional(),
  phone: z.string().max(100).optional(),
  companyName: name.optional(),
  hasInsurance: yesNo,
  insurerName: name.optional(),
  insurerId: z.string().max(200).optional(),
  underWarranty: z.enum(["yes", "no", "unsure"]),
  isInsuranceClaim: yesNo,
  claimNumber: name.optional(),
  noClaimNumberYet: z.boolean().optional(),
  isThirdPartyClaim: yesNo,
  suspectedEngineDamage: yesNo,
  vehicle: Vehicle.optional(),
  // A text box: the route does Number() on it.
  mileageKm: z.union([z.number(), z.string().max(50)]).optional(),
  odometerImage: MediaRef.nullable().optional(),
  discImage: MediaRef.nullable().optional(),
  video: MediaRef.nullable().optional(),
  requiredPhotos: RequiredPhotos.optional(),
  // Fifteen in either form.
  damagePhotos: z.array(MediaRef).max(50).optional(),
  /** Where the vehicle is. The route geocodes it; the result is never posted. */
  town: name.optional(),
  province: name.optional(),
};

/**
 * POST /api/requests from the consumer form. Anonymous.
 *
 * Never set: reference, publicToken, status, createdAt, quotes,
 * selectedPanelBeaterIds (a consumer no longer picks workshops: we assign
 * them), letUsChoose, quotesRequested, repairerInitiated, rateCardId,
 * location and nearestPanelBeaterKm (both measured by the server from the
 * town), and every payment field (paid, amount, Ozow reference).
 */
export const ConsumerRequestBody = z.strictObject({
  ...common,
  repairerQuote: z.literal(false).optional(),
});

/**
 * POST /api/requests from a signed-in workshop quoting a walk-in.
 *
 * selectedPanelBeaterIds is the workshop the quote is FOR: honoured only for
 * a login that may quote for any workshop, otherwise checked against their
 * own listing.
 *
 * Never set: reference, publicToken, status, createdAt, quotes,
 * quotesRequested (always 1), letUsChoose, repairerInitiated, location,
 * nearestPanelBeaterKm, payment fields.
 */
export const RepairerRequestBody = z.strictObject({
  ...common,
  repairerQuote: z.literal(true),
  selectedPanelBeaterIds: z.array(z.string().max(200)).max(20).optional(),
  rateCardId: z.string().max(200).optional(),
});

/** POST /api/requests: either of the above, told apart by repairerQuote. */
export const CreateRequestBody = z.discriminatedUnion("repairerQuote", [
  ConsumerRequestBody,
  RepairerRequestBody,
]);

/**
 * PATCH /api/requests/[reference]: move the status, OR replace the workshops.
 *
 * Never set: reference (it is the URL), quotes, publicToken, createdAt, any
 * of the customer's own details, payment fields.
 */
export const UpdateRequestBody = z.strictObject({
  status: z.enum(["new", "in_progress", "completed"]).optional(),
  panelBeaterIds: z.array(z.string().max(200)).max(200).optional(),
});
