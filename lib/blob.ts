import { put, del, get } from "@vercel/blob";
import { mediaPath, pathnameFromMediaUrl } from "./mediaPath";

// ---------------------------------------------------------------------------
// Media store on top of a PRIVATE Vercel Blob store.
//
// Records live in Postgres (lib/db.ts); this module handles BYTES only —
// photos, licence discs, video, warranty certificates and generated PDFs.
// Everything is stored with access:"private" and streamed back to the browser
// through /api/media/<pathname>, so customer media is never publicly reachable.
// ---------------------------------------------------------------------------

export async function deleteBlob(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch {
    // best-effort
  }
}

// Upload binary media (photos, disc image, video, PDFs). Random suffix keeps
// pathnames unguessable. Returns a proxy URL for the browser + the raw pathname.
export async function uploadMedia(
  pathname: string,
  data: Buffer | Blob | ArrayBuffer,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  const blob = await put(pathname, data as Buffer, {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });
  return { url: mediaPath(blob.pathname), pathname: blob.pathname };
}

/** Stream a private media blob (used by the /api/media proxy route). */
export async function streamMedia(
  pathname: string
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { stream: res.stream, contentType: res.blob.contentType };
  } catch {
    return null;
  }
}

/** Read private media bytes server-side (e.g. embedding a logo in a PDF). */
export async function readMediaBytes(
  urlOrPathname: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const pathname = pathnameFromMediaUrl(urlOrPathname);
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const buffer = Buffer.from(await new Response(res.stream).arrayBuffer());
    return { buffer, contentType: res.blob.contentType };
  } catch {
    return null;
  }
}

