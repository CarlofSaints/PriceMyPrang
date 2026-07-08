import { streamMedia } from "@/lib/blob";
import { isMediaPathname } from "@/lib/mediaPath";

// Streams a PRIVATE media blob (damage photos, licence disc, video, logos,
// quote PDFs). URLs contain an unguessable random suffix. Only media prefixes
// are allowed — data files (users, requests JSON) can never be reached here.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathname = path.join("/"); // Next has already URL-decoded each segment

  if (!isMediaPathname(pathname)) {
    return new Response("Not found", { status: 404 });
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
