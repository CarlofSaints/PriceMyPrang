import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { geocodeWithStatus } from "@/lib/geocode";

// Look up coordinates for an address on demand (the "Get coordinates" button).
//
// PUBLIC: the sign-up form runs this before the applicant has a login, so it
// can't require one — letting them see the pin means they can fix a wrong
// address before submitting, instead of it landing "not geocoded" for an admin.
// It does spend Google Geocoding quota though, so anonymous callers are capped.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const MAX_ADDRESS_LENGTH = 300;

// Per-instance memory only: Vercel runs several and recycles them, so this is a
// brake on casual hammering, not a hard quota. Enough for a form button.
const recentHits = new Map<string, number[]>();

function overRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (recentHits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recentHits.set(ip, hits);

  // Drop callers who've gone quiet, so the map can't grow without bound.
  if (recentHits.size > 1000) {
    for (const [key, times] of recentHits) {
      if (!times.some((t) => now - t < WINDOW_MS)) recentHits.delete(key);
    }
  }

  return hits.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (user) {
    // A signed-in user still needs a panel-beater permission — being logged in
    // isn't a free pass to the admin form's tooling.
    if (!can(user, "manage_panel_beaters") && !can(user, "onboard_self"))
      return NextResponse.json(
        { ok: false, status: "FORBIDDEN", error: "Forbidden" },
        { status: 403 }
      );
  } else {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (overRateLimit(ip))
      return NextResponse.json(
        { ok: false, status: "RATE_LIMITED", error: "Too many lookups" },
        { status: 429 }
      );
  }

  const { address } = (await request.json()) as { address?: string };
  if (!address?.trim())
    return NextResponse.json(
      { ok: false, status: "NO_ADDRESS", error: "Enter an address first" },
      { status: 400 }
    );
  if (address.length > MAX_ADDRESS_LENGTH)
    return NextResponse.json(
      { ok: false, status: "ADDRESS_TOO_LONG", error: "Address is too long" },
      { status: 400 }
    );

  const result = await geocodeWithStatus(address);

  // keySource names which env var is configured — a diagnostic for our own
  // people, not something to hand to anonymous callers.
  if (!user)
    return NextResponse.json({
      ok: result.ok,
      lat: result.lat,
      lng: result.lng,
      status: result.status,
      error: result.error,
    });

  return NextResponse.json(result);
}
