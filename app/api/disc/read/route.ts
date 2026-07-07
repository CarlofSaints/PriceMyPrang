import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { VehicleDetails } from "@/lib/types";

export const maxDuration = 60;

// Reads a South African vehicle licence disc and extracts vehicle identity.
// NOTE: MVP approach — Claude reads the disc directly. The VIN lookup will be
// upgraded to a proper VIN → vehicle-details API later (firstcheck / vindocs).
export async function POST(request: Request) {
  const { url } = (await request.json()) as { url?: string };
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key configured — return empty so the flow still works.
    return NextResponse.json({} satisfies VehicleDetails);
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system:
        "You read South African vehicle licence discs. Extract the vehicle identity fields. " +
        "Respond with ONLY a JSON object, no prose. Keys: vin, make, model, series, year, colour, " +
        "registration, discRawText. Use the VIN/chassis number for `vin`. If a field is not visible, " +
        "use an empty string. `discRawText` = all text you can read on the disc.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url },
            },
            {
              type: "text",
              text: "Read this South African licence disc and return the JSON.",
            },
          ],
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({} satisfies VehicleDetails);

    const parsed = JSON.parse(match[0]) as Record<string, string>;
    const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);

    const result: VehicleDetails = {
      vin: clean(parsed.vin),
      make: clean(parsed.make),
      model: clean(parsed.model),
      series: clean(parsed.series),
      year: clean(parsed.year),
      colour: clean(parsed.colour),
      registration: clean(parsed.registration),
      discRawText: clean(parsed.discRawText),
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("disc read failed", err);
    return NextResponse.json({} satisfies VehicleDetails);
  }
}
