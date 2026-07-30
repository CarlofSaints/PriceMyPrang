// ---------------------------------------------------------------------------
// Spotting the same photo twice, in the browser, before anything is uploaded.
//
// Two fingerprints, because they catch different mistakes:
//
//   sha256  — the exact same FILE. This is the common case by a mile: someone
//             picks the same image for "Front" and "Back" because the file
//             picker reopened on the last thing they touched. Byte-identical,
//             so a hash match is certain and can never be a false positive.
//
//   dHash   — the same PICTURE, not the same file: resaved, resized, recompressed,
//             screenshotted, or re-sent through WhatsApp (which re-encodes every
//             image, so the bytes always differ). A 64-bit gradient hash compared
//             by Hamming distance.
//
// Deliberately NOT OCR. OCR extracts text; two photos of a bumper contain no
// text to compare, so it cannot answer this question at all. It would also mean
// a server round-trip per photo, for a worse answer.
//
// Everything here is browser-only (crypto.subtle, createImageBitmap, canvas).
// ---------------------------------------------------------------------------

export interface Fingerprint {
  /** Hex SHA-256 of the raw bytes. */
  sha: string;
  /** 64-bit difference hash as 16 hex chars, or null if the image wouldn't decode. */
  dhash: string | null;
}

/** Anything already accepted, so a new photo can be checked against it. */
export interface FingerprintedPhoto extends Fingerprint {
  /** What to call it in the message: "Front", "Left side", "damage photo 2". */
  label: string;
}

/**
 * Bits that may differ before two images are still called the same picture.
 *
 * A re-encode of one photo typically lands at 0–2. Genuinely different angles
 * of the same car sit well above 10. Five keeps a comfortable gap: the cost of
 * a false positive here is blocking a legitimate photo, which is far more
 * annoying than letting a near-duplicate through.
 */
export const DUPLICATE_DISTANCE = 5;

const DHASH_W = 9; // one extra column: 8 comparisons per row
const DHASH_H = 8;

export async function sha256Hex(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Difference hash: shrink to 9x8, greyscale, then record whether each pixel is
 * brighter than the one to its right. Scale and compression barely move it,
 * which is exactly the property we want.
 */
export async function dHash(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = DHASH_W;
    canvas.height = DHASH_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, DHASH_W, DHASH_H);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, DHASH_W, DHASH_H);

    // Rec. 601 luma — closer to perceived brightness than a flat average.
    const grey: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    let bits = "";
    for (let y = 0; y < DHASH_H; y++) {
      for (let x = 0; x < DHASH_W - 1; x++) {
        bits += grey[y * DHASH_W + x] > grey[y * DHASH_W + x + 1] ? "1" : "0";
      }
    }

    let hex = "";
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch {
    // HEIC on a browser that won't decode it, a corrupt file, a video. Not a
    // failure: we simply fall back to the exact-bytes check for that one.
    return null;
  }
}

export async function fingerprint(file: Blob): Promise<Fingerprint> {
  const [sha, dhash] = await Promise.all([sha256Hex(file), dHash(file)]);
  return { sha, dhash };
}

/** Bits that differ between two equal-length hex hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * The first already-accepted photo this one duplicates, or null.
 * `exact` distinguishes "the identical file" from "looks like the same photo",
 * so the message can be honest about which it is.
 */
export function findDuplicate(
  candidate: Fingerprint,
  existing: FingerprintedPhoto[]
): { match: FingerprintedPhoto; exact: boolean } | null {
  for (const photo of existing) {
    if (photo.sha === candidate.sha) return { match: photo, exact: true };
  }
  if (candidate.dhash) {
    for (const photo of existing) {
      if (!photo.dhash) continue;
      if (hammingDistance(photo.dhash, candidate.dhash) <= DUPLICATE_DISTANCE)
        return { match: photo, exact: false };
    }
  }
  return null;
}

/** The message the customer sees. Says what to do, not just what went wrong. */
export function duplicateMessage(hit: { match: FingerprintedPhoto; exact: boolean }): string {
  return hit.exact
    ? `That's the same file you used for ${hit.match.label}. Please take a new photo.`
    : `That looks like the same photo you used for ${hit.match.label}. Please take a new one from the angle asked for.`;
}
