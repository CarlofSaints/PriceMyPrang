import { put, del, get, head } from "@vercel/blob";
import { mediaPath, pathnameFromMediaUrl } from "./mediaPath";

// ---------------------------------------------------------------------------
// JSON + media store on top of a PRIVATE Vercel Blob store.
//
// Everything is stored with access:"private", so password hashes and customer
// data are never publicly reachable. JSON is read back server-side with the
// token via get(); media is streamed through /api/media/<pathname>.
// ---------------------------------------------------------------------------

export async function readJson<T>(pathname: string): Promise<T | null> {
  return (await readJsonWithEtag<T>(pathname)).data;
}

/**
 * Read JSON along with its ETag, so the caller can write it back conditionally.
 * A missing blob returns { data: null } with no etag.
 */
export async function readJsonWithEtag<T>(
  pathname: string
): Promise<{ data: T | null; etag?: string }> {
  try {
    const res = await get(pathname, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return { data: null };
    const text = await new Response(res.stream).text();
    return { data: JSON.parse(text) as T, etag: res.blob.etag };
  } catch {
    return { data: null };
  }
}

/** Unconditional write. Only safe for blobs with a single writer. */
export async function writeJson<T>(pathname: string, data: T): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/**
 * Write JSON only if nothing exists at `pathname` yet.
 * Returns false when the pathname is already taken (someone else won the race).
 */
export async function createJsonIfAbsent<T>(pathname: string, data: T): Promise<boolean> {
  try {
    await put(pathname, JSON.stringify(data, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return true;
  } catch (err) {
    // allowOverwrite:false surfaces the conflict as a generic error rather than
    // a typed one, so confirm against the store instead of matching a message.
    try {
      await head(pathname);
      return false; // it exists — a concurrent writer got there first
    } catch {
      throw err; // it doesn't exist, so the put failed for a real reason
    }
  }
}

/**
 * Read-modify-write a JSON blob under optimistic concurrency control.
 *
 * Concurrent writers can no longer clobber one another: the write only lands if
 * the blob hasn't changed since we read it (ifMatch), or if we are the one
 * creating it (allowOverwrite:false). On a conflict we re-read and re-apply.
 *
 * `mutate` must be pure — it is called again on every retry.
 */
export async function updateJson<T>(
  pathname: string,
  mutate: (current: T | null) => T,
  attempts = 6
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, etag } = await readJsonWithEtag<T>(pathname);
    const next = mutate(data);

    try {
      await put(pathname, JSON.stringify(next, null, 2), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        ...(etag
          ? { allowOverwrite: true, ifMatch: etag }
          : { allowOverwrite: false }),
      });
      return next;
    } catch (err) {
      lastErr = err;
      // Back off a little before re-reading, with jitter so simultaneous
      // writers don't line up and collide again on the retry.
      await new Promise((r) => setTimeout(r, 40 * 2 ** attempt + Math.random() * 40));
    }
  }

  throw lastErr;
}

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

// ---- Collection paths ----
export const PATHS = {
  users: "data/users.json",
  roles: "data/roles.json",
  rateTypes: "data/rate-types.json",
  insurers: "data/insurers.json",
  panelBeaters: "data/panel-beaters.json",
  suppliers: "data/suppliers.json",
  counters: "data/counters.json",
  requestIndex: "data/request-index.json",
  request: (ref: string) => `data/requests/${ref}.json`,
} as const;
