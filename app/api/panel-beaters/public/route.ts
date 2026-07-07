import { NextResponse } from "next/server";
import { getPanelBeaters } from "@/lib/store";

// Public, consumer-facing list — only what the map needs, only active workshops.
export async function GET() {
  const all = await getPanelBeaters();
  const publicList = all
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      companyName: p.companyName,
      tradingAs: p.tradingAs,
      physicalAddress: p.physicalAddress,
      lat: p.lat,
      lng: p.lng,
      rmiNumber: p.rmiNumber,
      sambraNumber: p.sambraNumber,
      logoUrl: p.logoUrl,
      active: p.active,
    }));
  return NextResponse.json(publicList);
}
