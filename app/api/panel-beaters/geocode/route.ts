import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { geocodeWithStatus } from "@/lib/geocode";

// Look up coordinates for an address on demand (the "Get coordinates" button).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_panel_beaters") && !can(user, "onboard_self"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { address } = (await request.json()) as { address?: string };
  if (!address?.trim())
    return NextResponse.json({ error: "Enter an address first" }, { status: 400 });

  const result = await geocodeWithStatus(address);
  return NextResponse.json(result);
}
