import { z } from "zod";

// Request bodies for /api/public/*: the routes anyone on the internet can
// reach. See lib/validate.ts for why every object here is strict. Fields are
// optional where the route has its own friendlier "X required" reply, so that
// reply still reaches the person typing.

const token = z.string().max(500);
const text = z.string().max(20000);

/** One photo or clip attached to a complaint, as the upload hands it back. */
const ComplaintMedia = z.strictObject({
  url: z.string().max(2000),
  pathname: z.string().max(1000),
  contentType: z.string().max(200).optional(),
  isVideo: z.boolean().optional(),
});

/**
 * POST /api/public/feedback/[token], kind "rating".
 *
 * Never set: requestId (comes from the token), the workshop's name, any
 * rating id. panelBeaterId is only a CHOICE among the workshops the token's
 * job went to; the route refuses any other.
 */
const RatingBody = z.strictObject({
  kind: z.literal("rating"),
  panelBeaterId: z.string().max(200).optional(),
  // The route does Number(score) and gives its own "1 to 5" message.
  score: z.union([z.number(), z.string().max(20)]).optional(),
  comment: text.nullable().optional(),
});

/**
 * POST /api/public/feedback/[token], kind "complaint".
 *
 * Never set: requestId, status, submittedIp, submittedUserAgent (observed by
 * the server, never asked for), the complaint id, any handling notes.
 */
const ComplaintBody = z.strictObject({
  kind: z.literal("complaint"),
  panelBeaterId: z.string().max(200).optional(),
  category: z
    .enum(["workmanship", "paint", "parts", "delays", "billing", "conduct", "other"])
    .optional(),
  description: text.optional(),
  vehicleSafety: z.enum(["safe", "unsafe", "unsure"]).optional(),
  desiredOutcome: z.enum(["rework", "refund", "explanation", "other"]).optional(),
  collectedOn: z.string().max(50).optional(),
  problemNoticedOn: z.string().max(50).optional(),
  stillWithRepairer: z.boolean().optional(),
  raisedWithRepairer: z.boolean().optional(),
  // Five photos and one clip in the form; the route slices to six as well.
  media: z.array(ComplaintMedia).max(12).optional(),
});

export const FeedbackBody = z.discriminatedUnion("kind", [RatingBody, ComplaintBody]);

/**
 * POST /api/public/feedback/request-link.
 *
 * Never set: email (the link only ever goes to the address already on the
 * job), requestId, the token.
 */
export const FeedbackLinkBody = z.strictObject({
  reference: z.string().max(200).optional(),
});

/**
 * POST /api/public/forgot-password.
 *
 * Never set: userId, the token, its expiry or purpose.
 */
export const ForgotPasswordBody = z.strictObject({
  email: z.string().max(320).optional(),
});

/**
 * POST /api/public/pay. The publicToken is the whole credential.
 *
 * Never set: amount, requestId, payment status or reference, return URLs.
 * What is charged and where Ozow sends them back are the server's.
 */
export const PayBody = z.strictObject({
  token: token.optional(),
});

/**
 * POST /api/public/quotes/accept.
 *
 * Never set: status, acceptedAt, requestId, panelBeaterId. Which job the quote
 * belongs to is checked against the token, never taken from the body.
 */
export const AcceptQuoteBody = z.strictObject({
  token: token.optional(),
  quoteId: z.string().max(200).optional(),
});

/**
 * POST /api/public/set-password.
 *
 * Never set: userId, email, passwordHash, mustChangePassword. Whose password
 * it is comes from the token alone.
 */
export const SetPasswordBody = z.strictObject({
  token: token.optional(),
  password: z.string().max(1000).optional(),
});
