// Pure helpers shared by client + server (no server-only imports here).
//
// Media blobs live in a PRIVATE store, so they can't be viewed by their raw
// blob URL. Instead we store a relative proxy path and stream the bytes through
// /api/media/<pathname> using the server token. Data (users, requests, etc.)
// is NEVER served by that proxy — only these media prefixes are allowed.

export const MEDIA_PREFIXES = ["requests/", "panel-beaters/", "quotes/"] as const;

export function isMediaPathname(pathname: string): boolean {
  return MEDIA_PREFIXES.some((p) => pathname.startsWith(p));
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
