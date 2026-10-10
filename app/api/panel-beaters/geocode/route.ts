import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { geocodeWithStatus } from "@/lib/geocode";
import { parseJson } from "@/lib/validate";
import { GeocodeBody } from "@/lib/schemas/panelBeaters";
import { hit, clientIp } from "@/lib/rateLimit";

// Look up coordinates for an address on demand (the "Get coordinates" button).
//
// PUBLIC: the sign-up form runs this before the applicant has a login, so it
// can't require one: letting them see the pin means they can fix a wrong
// address before submitting, instead of it landing "not geocoded" for an admin.
// It does spend Google Geocoding quota though, so every caller is capped:
// anonymous ones per IP, signed-in ones per user (lib/rateLimit LIMITS).
const MAX_ADDRESS_LENGTH = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (user) {
    // A signed-in user still needs a panel-beater permission: being logged in
    // isn't a free pass to the admin form's tooling.
    if (!can(user, "manage_panel_beaters") && !can(user, "onboard_self"))
      return NextResponse.json(
        { ok: false, status: "FORBIDDEN", error: "Forbidden" },
        { status: 403 }
      );
  }

  // Same shape as every other answer here (ok/status/error): the form reads it.
  const limited = user ? await hit("geocodeUser", user.id) : await hit("geocodeAnon", clientIp(request));
  if (!limited.ok)
    return NextResponse.json(
      { ok: false, status: "RATE_LIMITED", error: "Too many lookups" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );

  const parsed = await parseJson(request, GeocodeBody, "POST /api/panel-beaters/geocode");
  if (parsed.response) return parsed.response;
  const { address } = parsed.data;
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

  // keySource names which env var is configured: a diagnostic for our own
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
