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
        // This list must cover every `accept=` on every form that posts here.
        // Warranty certificates are asked for as "image/*,application/pdf" on
        // the registration form and on a repairer's own listing, and a
        // certificate is almost always a PDF — leaving it out of this list
        // failed the upload at the Blob API with "Content type mismatch",
        // which the form could only report as "upload failed", so applicants
        // were told to load the certificate again, forever.
        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "application/pdf",
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
