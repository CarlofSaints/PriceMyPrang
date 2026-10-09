// ---------------------------------------------------------------------------
// The key that signs session cookies. Shared by lib/auth.ts (signs + verifies)
// and proxy.ts (verifies), so the two can never disagree.
//
// No fallback outside local dev: this repo is PUBLIC, so any default written
// here is a key anyone can read and use to forge an admin session. If the env
// var is missing in a deployed build we refuse to sign or trust anything
// rather than quietly fall back to it.
// ---------------------------------------------------------------------------

const DEV_ONLY_SECRET = "dev-only-insecure-secret-change-me";

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV !== "production") return new TextEncoder().encode(DEV_ONLY_SECRET);
  throw new Error("SESSION_SECRET is not set. Refusing to sign or verify sessions.");
}
