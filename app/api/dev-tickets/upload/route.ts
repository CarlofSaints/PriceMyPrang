import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Client-upload token for dev-ticket attachments.
//
// Separate from /api/media/upload on purpose. That endpoint is deliberately
// unauthenticated (a consumer uploads photos before any account exists) and is
// therefore limited to images and video. Documents are only accepted here,
// behind the manage_dev_tickets permission, so widening the file types never
// widens what an anonymous caller can put in the blob store.
// ---------------------------------------------------------------------------

const ALLOWED_CONTENT_TYPES = [
  // Images — screenshots are the common case.
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  // Documents.
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  // Screen recordings.
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export async function POST(request: Request): Promise<NextResponse> {
  // Checked BEFORE a token is minted — an upload token is a write credential,
  // so it must never be handed out to someone who could not create a ticket.
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_dev_tickets"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        addRandomSuffix: true,
        maximumSizeInBytes: 25 * 1024 * 1024,
      }),
      // No-op: attachment rows are written by /api/dev-tickets, not on upload.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
