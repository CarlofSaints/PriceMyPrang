import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readMediaBytes } from "@/lib/blob";
import { isAnonReadableMedia, pathnameFromMediaUrl } from "@/lib/mediaPath";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rateLimit";

export const maxDuration = 60;

const ALLOWED_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

interface OdometerReading {
  km?: number;
  rawText?: string;
}

// Reads a vehicle odometer from a dashboard photo and extracts the total km.
export async function POST(request: Request) {
  // Anonymous by design — see the note in /api/disc/read. Same two guards.
  const ip = clientIp(request);
  const limited = rateLimit(`odo-read:${ip}`, 12, 60_000);
  if (!limited.ok)
    return tooManyRequests(limited.retryAfter, "Too many reads. Please wait a moment.");

  const { pathname, url } = (await request.json()) as { pathname?: string; url?: string };
  const ref = pathname || url;
  if (!ref) return NextResponse.json({ error: "Missing pathname" }, { status: 400 });

  // Without this, a caller could name any blob and have its text read back.
  if (!isAnonReadableMedia(pathnameFromMediaUrl(ref)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({} satisfies OdometerReading);

  const media = await readMediaBytes(ref);
  if (!media) return NextResponse.json({} satisfies OdometerReading);
  const mediaType = (ALLOWED_MEDIA as readonly string[]).includes(media.contentType)
    ? (media.contentType as (typeof ALLOWED_MEDIA)[number])
    : "image/jpeg";

  try {
    const anthropic = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system:
        "You read a vehicle's odometer from a dashboard photo. Return ONLY a JSON object, no prose. " +
        "Keys: km (integer — the TOTAL distance on the main odometer, no thousands separators; ignore " +
        "trip meters, speed, fuel or rev counters), rawText (the digits/text you can see). " +
        "If you cannot confidently read the total distance, set km to null.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: media.buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Read the odometer's total kilometres and return the JSON.",
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
    if (!match) return NextResponse.json({} satisfies OdometerReading);

    const parsed = JSON.parse(match[0]) as { km?: unknown; rawText?: unknown };
    const km = Number(parsed.km);
    const result: OdometerReading = {
      km: Number.isFinite(km) && km > 0 ? Math.round(km) : undefined,
      rawText: typeof parsed.rawText === "string" && parsed.rawText.trim() ? parsed.rawText.trim() : undefined,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("odometer read failed", err);
    return NextResponse.json({} satisfies OdometerReading);
  }
}
