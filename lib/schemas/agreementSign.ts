import { z } from "zod";

/**
 * POST /api/public/agreement/sign. PUBLIC: the token from the emailed link is
 * the credential, so it is the one thing here that is meant to come from the
 * browser.
 * NEVER-SET: signedAt, signerIp and signerUserAgent (observed by the server
 * from the request, which is what makes this an auditable signature),
 * panelBeaterId, documentId, signedPdfUrl, sentToName, sentToEmail.
 * Fields stay optional so the route's own messages ("Type your full name to
 * sign") still reach the person.
 */
export const AgreementSignBody = z.strictObject({
  token: z.string().max(500).optional(),
  signerName: z.string().max(200).optional(),
  signerTitle: z.string().max(200).optional(),
  accepted: z.boolean().optional(),
});
