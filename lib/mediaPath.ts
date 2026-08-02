// Pure helpers shared by client + server (no server-only imports here).
//
// Media blobs live in a PRIVATE store, so they can't be viewed by their raw
// blob URL. Instead we store a relative proxy path and stream the bytes through
// /api/media/<pathname> using the server token. Data (users, requests, etc.)
// is NEVER served by that proxy — only these media prefixes are allowed.

export const MEDIA_PREFIXES = [
  "requests/",
  "panel-beaters/",
  "quotes/",
  "dev-tickets/",
  "complaints/",
] as const;

/**
 * Prefixes /api/media will not serve without a permission check.
 *
 * The proxy is otherwise deliberately open: emailed quote PDFs and certificate
 * links have to work for people with no login, and they rely on the pathname
 * being unguessable. Internal documents and complaint evidence have no such
 * excuse — a complaint is private between the customer, the workshop named in
 * it, and us.
 */
export const GUARDED_MEDIA_PREFIXES = ["dev-tickets/", "complaints/"] as const;

export function isGuardedMedia(pathname: string): boolean {
  return GUARDED_MEDIA_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isMediaPathname(pathname: string): boolean {
  return MEDIA_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * The only prefix an UNAUTHENTICATED endpoint may read bytes from.
 *
 * `requests/` is where a consumer's own upload lands — their licence disc and
 * odometer photo, taken seconds earlier by someone with no account. Everything
 * else in the store belongs to somebody: `dev-tickets/` is internal, and
 * `panel-beaters/` holds warranty certificates.
 *
 * This exists because the OCR endpoints take a pathname from the request body
 * and read it with the SERVER's token. Without an allowlist they will happily
 * read a document that /api/media deliberately refuses to serve, and hand it
 * back as extracted text — the permission check bypassed, not defeated.
 */
export const ANON_READABLE_PREFIXES = ["requests/"] as const;

export function isAnonReadableMedia(pathname: string): boolean {
  // Reject traversal and absolute paths before the prefix test, or
  // "requests/../dev-tickets/x" would sail through it.
  if (!pathname || pathname.includes("..") || pathname.startsWith("/")) return false;
  return ANON_READABLE_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Build the proxy URL the browser/email uses to view a private media blob. */
export function mediaPath(pathname: string): string {
  return "/api/media/" + pathname.split("/").map(encodeURIComponent).join("/");
}

/** Recover the blob pathname from a stored proxy URL (or a legacy blob URL). */
export function pathnameFromMediaUrl(url: string): string {
  if (url.startsWith("/api/media/")) {
    return url
      .slice("/api/media/".length)
      .split("/")
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .join("/");
  }
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return url;
  }
}

/** Make a filename safe for use inside a blob pathname / URL. */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "file";
}
