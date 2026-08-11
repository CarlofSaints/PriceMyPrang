import { streamMedia } from "@/lib/blob";
import { isMediaPathname } from "@/lib/mediaPath";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logActivity, actorFromUser, consumerActor } from "@/lib/activityLog";

// Streams a PRIVATE media blob (damage photos, licence disc, video, logos,
// quote PDFs). URLs contain an unguessable random suffix. Only media prefixes
// are allowed — data files (users, requests JSON) can never be reached here.
//
// Customer media stays reachable by URL alone, because emailed links to quote
// PDFs and certificates have to work for people with no login. Dev-ticket
// attachments are the exception: they are internal documents, nothing outside
// the portal ever links to them, so they get a real permission check.
//
// Successful reads are deliberately NOT logged: a single quote PDF or gallery
// page pulls a dozen files and would bury every real action under image
// requests. REFUSALS are logged, because those are the ones worth knowing about.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathname = path.join("/"); // Next has already URL-decoded each segment

  if (!isMediaPathname(pathname)) {
    return new Response("Not found", { status: 404 });
  }

  // 404 rather than 403 throughout — a signed-out caller learns nothing about
  // whether the file exists.
  if (pathname.startsWith("dev-tickets/")) {
    const user = await getCurrentUser();
    if (!can(user, "manage_dev_tickets")) {
      await logActivity({
        action: "media.denied",
        summary: `An internal dev-planner file was requested by someone without access`,
        outcome: "denied",
        status: 404,
        entityType: "media",
        entityLabel: pathname,
        ...(user ? actorFromUser(user) : consumerActor()),
        detail: { pathname, prefix: "dev-tickets/" },
        request,
      });
      return new Response("Not found", { status: 404 });
    }
  }

  // Complaint evidence. Private between the customer, the workshop named in the
  // complaint, and us — so unlike a quote PDF it is never reachable by URL
  // alone. Either complaints permission gets in; the pathname's random suffix
  // is what stops one workshop stumbling onto another's.
  if (pathname.startsWith("complaints/")) {
    const user = await getCurrentUser();
    if (!can(user, "manage_complaints") && !can(user, "manage_own_complaints")) {
      await logActivity({
        action: "media.denied",
        summary: `Complaint evidence was requested by someone without access`,
        outcome: "denied",
        status: 404,
        entityType: "media",
        entityLabel: pathname,
        ...(user ? actorFromUser(user) : consumerActor()),
        detail: { pathname, prefix: "complaints/" },
        request,
      });
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
