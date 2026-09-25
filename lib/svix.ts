import crypto from "node:crypto";

/**
 * Verify a Svix-signed webhook. Resend and Ozow both deliver through Svix, so
 * both routes share this one check.
 *
 * Verified by hand rather than pulling in the `svix` package: it is one HMAC,
 * and a dependency added for twenty lines is a dependency to keep patched
 * forever. `rawBody` must be the exact text received: parsing the JSON and
 * serialising it back changes the bytes and nothing will ever match.
 */
export function verifySvix(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  // Refuse anything older than five minutes, so a signed request captured off
  // the wire can't be replayed indefinitely.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  // "whsec_" prefix is a label, not part of the key.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  // The header carries a space-separated list of versioned signatures, because
  // a secret being rotated means two are briefly valid at once.
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
