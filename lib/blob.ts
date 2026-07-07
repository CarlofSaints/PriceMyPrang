import { put, list, del } from "@vercel/blob";

// ---------------------------------------------------------------------------
// Tiny JSON-store on top of Vercel Blob.
//
// We use STABLE pathnames (addRandomSuffix: false) so a logical key always maps
// to the same blob, and short cache TTLs + a cache-busting query so overwrites
// are read back fresh. Good enough for this app's scale; can migrate to a real
// DB later without touching callers.
// ---------------------------------------------------------------------------

async function urlFor(pathname: string): Promise<string | null> {
  const { blobs } = await list({ prefix: pathname, limit: 100 });
  const found = blobs.find((b) => b.pathname === pathname);
  return found?.url ?? null;
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  const url = await urlFor(pathname);
  if (!url) return null;
  const res = await fetch(`${url}?ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(pathname: string, data: T): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export async function deleteBlob(pathname: string): Promise<void> {
  const url = await urlFor(pathname);
  if (url) await del(url);
}

// Upload arbitrary binary media (photos, disc image, video). Random suffix on
// so URLs are unguessable; returns the public URL + pathname.
export async function uploadMedia(
  pathname: string,
  data: Buffer | Blob | ArrayBuffer,
  contentType: string
): Promise<{ url: string; pathname: string }> {
  const blob = await put(pathname, data as Buffer, {
    access: "public",
    contentType,
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return { url: blob.url, pathname: blob.pathname };
}

// ---- Collection paths ----
export const PATHS = {
  users: "data/users.json",
  panelBeaters: "data/panel-beaters.json",
  parts: "data/parts.json",
  counters: "data/counters.json",
  requestIndex: "data/request-index.json",
  request: (ref: string) => `data/requests/${ref}.json`,
} as const;
