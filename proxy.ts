import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "pmp_session";

/** Where the site actually lives. Everything else redirects here. */
const CANONICAL_HOST = "www.pricemyprang.co.za";

/**
 * Hosts that should be sent to the canonical one.
 *
 * Deliberately an explicit list rather than "any *.vercel.app": every preview
 * deployment gets its own vercel.app host, and redirecting those away would
 * make it impossible to test a branch before it ships.
 */
const REDIRECT_HOSTS = new Set([
  "price-my-prang.vercel.app",
  "pricemyprang.co.za",
]);

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase() ?? "";

  // One address for the site, so the same page isn't reachable at two URLs.
  // 308 keeps the method and body, so a redirected POST still works.
  //
  // /api is left alone: anything calling it with a fixed URL (a webhook, an
  // integration) may not follow redirects, and would silently start failing.
  if (REDIRECT_HOSTS.has(host) && !pathname.startsWith("/api/")) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Protect the portal. Fine-grained permission checks happen in the pages/APIs.
  if (pathname.startsWith("/portal")) {
    const token = request.cookies.get(COOKIE_NAME)?.value;

    let valid = false;
    if (token) {
      try {
        await jwtVerify(token, secret());
        valid = true;
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // The host redirect has to see every page request, so this can no longer be
  // scoped to /portal. Next internals and public assets are excluded, or the
  // redirect would fire on CSS, JS and images too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.[\\w]+$).*)"],
};
