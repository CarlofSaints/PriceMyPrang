import { NextResponse } from "next/server";
import { getInsurers } from "@/lib/store";

// Public, consumer-facing list — only active insurers' id + name, for the
// "Who is your insurance company?" dropdown on the quote form.
export async function GET() {
  const list = await getInsurers();
  const publicList = list
    .filter((i) => i.active)
    .map((i) => ({ id: i.id, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(publicList);
}
