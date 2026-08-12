// Turn a Blob client-upload failure into something the person filling in the
// form can act on.
//
// The plain "upload failed" message this replaces was the whole reason a
// Durban North repairer sat re-picking the same PDF: the real cause (the file
// type wasn't on the server's allow-list) never reached the screen, so the
// form just kept asking for the certificate again.

/**
 * What a certificate file picker offers.
 *
 * MUST stay in step with `allowedContentTypes` in app/api/media/upload/route.ts
 * — a picker that offers a type the server refuses is the exact bug this file
 * exists because of. Extensions are listed alongside the MIME types because
 * Windows hands some Office files a blank or vendor-specific type.
 */
export const CERTIFICATE_ACCEPT =
  "image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx";

/**
 * Shown ABOVE the file picker, not after a failure.
 *
 * Says what will work and names the one thing that won't, because "why was my
 * file refused" is a question best answered before the file is chosen. SVG is
 * called out by name rather than left to be discovered: it is the only format
 * a person could reasonably expect to work here and doesn't.
 */
export const CERTIFICATE_FORMATS_HINT =
  "PDF, Word or Excel, or a photo or scan (JPG, PNG, TIFF, BMP, GIF, HEIC). Max 60MB. SVG files can't be accepted.";

/** Same idea for the workshop logo, which is images only. */
export const LOGO_FORMATS_HINT =
  "JPG, PNG, WebP or GIF. SVG files can't be accepted.";

export function uploadErrorMessage(err: unknown, file?: File): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");

  if (/content type/i.test(raw)) {
    const type = file?.type || "that file type";
    return `We can't accept ${type} here — upload a PDF, a Word or Excel file, or a photo/scan (JPG, PNG, TIFF).`;
  }
  if (/too large|maximum|size/i.test(raw)) {
    return "That file is too big — keep it under 60MB.";
  }
  if (/fetch|network/i.test(raw)) {
    return "The upload couldn't reach us. Check your connection and try again.";
  }
  // Never swallow the reason: an unlabelled failure is one nobody can diagnose.
  return `Upload failed${raw ? ` — ${raw}` : "."}`;
}
