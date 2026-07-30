import { streamMedia } from "@/lib/blob";
import { isMediaPathname } from "@/lib/mediaPath";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Streams a PRIVATE media blob (damage photos, licence disc, video, logos,
// quote PDFs). URLs contain an unguessable random suffix. Only media prefixes
// are allowed — data files (users, requests JSON) can never be reached here.
//
// Customer media stays reachable by URL alone, because emailed links to quote
// PDFs and certificates have to work for people with no login. Dev-ticket
// attachments are the exception: they are internal documents, nothing outside
// the portal ever links to them, so they get a real permission check.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathname = path.join("/"); // Next has already URL-decoded each segment

  if (!isMediaPathname(pathname)) {
    return new Response("Not found", { status: 404 });
  }

  if (pathname.startsWith("dev-tickets/")) {
    const user = await getCurrentUser();
    // 404 rather than 403 — a signed-out caller learns nothing about whether
    // the file exists.
    if (!can(user, "manage_dev_tickets")) {
      return new Response("Not found", { status: 404 });
    }
  }

  const media = await streamMedia(pathname);
  if (!media) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(media.stream, {
    headers: {
      "content-type": media.contentType || "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}
