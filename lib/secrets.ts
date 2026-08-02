import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// ---------------------------------------------------------------------------
// Encryption for third-party credentials that are entered IN THE APP rather
// than set as Vercel env vars (currently the imagin8 VIN-lookup key).
//
// Why encrypt at all, when the row is already behind a Super Admin gate:
// Power BI reads this database DIRECTLY, and a reporting tool has its own
// access rules. A plaintext key column would put a live, billable credential
// somewhere it was never meant to travel. Ciphertext there is inert.
//
// AES-256-GCM, so the tag detects tampering as well as hiding the value — a
// silently altered key would otherwise surface as a confusing 401 from the
// vendor rather than an obvious local error.
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm";

/**
 * The wrapping key is derived from SESSION_SECRET rather than a new env var,
 * to keep the number of secrets Carl has to manage down.
 *
 * TRADE-OFF, deliberate: rotating SESSION_SECRET makes anything stored here
 * undecryptable. That is recoverable — re-enter the key on the Integrations
 * page — and `decryptSecret` reports it as a clear error rather than pretending
 * the key is simply unset.
 */
function wrappingKey(): Buffer {
  const source = process.env.SESSION_SECRET;
  if (!source) throw new Error("SESSION_SECRET is not set — cannot encrypt integration keys");
  // Fixed salt: the input is already a high-entropy secret, and a random salt
  // would have to be stored alongside every row for no added strength here.
  return scryptSync(source, "pmp-integration-secrets", 32);
}

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptSecret(plain: string): SealedSecret {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv(ALGO, wrappingKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Returns null when the stored value cannot be read — a rotated SESSION_SECRET
 * or a tampered row. Callers treat that as "no key configured" but the caller
 * that matters (the Integrations page) tells the admin to re-enter it, so this
 * never fails silently in a way that looks like the feature is broken.
 */
export function decryptSecret(sealed: SealedSecret): string | null {
  try {
    const decipher = createDecipheriv(ALGO, wrappingKey(), Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * "sk-live-abcd…wxyz" — enough for an admin to confirm WHICH key is loaded
 * without revealing it. The reveal endpoint (password-gated) is the only way
 * to see the whole thing.
 */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "•".repeat(plain.length);
  return `${plain.slice(0, 4)}${"•".repeat(Math.min(12, plain.length - 8))}${plain.slice(-4)}`;
}
