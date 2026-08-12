import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Client-upload token endpoint. Lets the browser upload photos/video straight
// to Vercel Blob, avoiding the 4.5MB serverless request-body limit.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // This list must cover every `accept=` on every form that posts here —
        // for certificates that is CERTIFICATE_ACCEPT in lib/uploadError.ts.
        // Warranty certificates are asked for as "image/*,application/pdf" on
        // the registration form and on a repairer's own listing, and a
        // certificate is almost always a PDF — leaving it out of this list
        // failed the upload at the Blob API with "Content type mismatch",
        // which the form could only report as "upload failed", so applicants
        // were told to load the certificate again, forever.
        //
        // `accept="image/*"` means EVERY image format, so a scanned
        // certificate arriving as TIFF or BMP has to be accepted too — the
        // file picker offers those whether or not this list does.
        //
        // SVG is excluded ON PURPOSE: it can carry script, and this endpoint
        // is unauthenticated. A certificate is never an SVG anyway.
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "image/tiff",
          "image/bmp",
          // Some scanners and older Windows tools label a .bmp this way.
          "image/x-ms-bmp",
          "image/gif",
          "image/avif",
          // Documents. Carl's call, 12 Aug 2026: repairers send whatever their
          // manufacturer gave them, and being told "wrong file type" is worse
          // for him than storing a .docx. Note this endpoint takes ANONYMOUS
          // uploads — that is the trade-off he accepted knowingly.
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "video/webm",
          "video/mp4",
          "video/quicktime",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 60 * 1024 * 1024, // 60MB (covers a 20s clip)
      }),
      // No-op: request records are written by /api/requests, not on upload.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }
}
