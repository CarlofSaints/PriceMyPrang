import { NextResponse } from "next/server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Request bodies are checked against a STRICT schema before a route reads
// them: an unknown field is a 400, never silently ignored.
//
// Why strict rather than "pick what we need": a field the server ignores
// today becomes a field it trusts the day someone adds `...body` to a save.
// Rejecting it at the door means a client can only ever send what a route
// was written to accept, and the fields a user must never set (ownership,
// approval, totals, ids the server mints) aren't in any schema at all.
//
// Schemas live in lib/schemas/*, pure zod, so scripts/test-schemas*.ts can
// prove them without a server or a database.
// ---------------------------------------------------------------------------

export type Parsed<T> = { data: T; response?: undefined } | { data?: undefined; response: NextResponse };

/** Turn zod issues into something a developer can act on, without echoing values. */
function describe(error: z.ZodError) {
  return error.issues.map((i) => ({
    path: i.path.join(".") || "(body)",
    message: i.message,
    ...(i.code === "unrecognized_keys" ? { keys: i.keys } : {}),
  }));
}

export function validate<T extends z.ZodType>(
  schema: T,
  input: unknown,
  where: string
): Parsed<z.infer<T>> {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };
  const issues = describe(result.error);
  // Shows up in Vercel's logs: a rejection here is either an attack or a
  // client that drifted from its schema, and both need a human to look.
  console.warn(`[validate] ${where} rejected a request body`, JSON.stringify(issues));
  return {
    response: NextResponse.json({ error: "Invalid request", issues }, { status: 400 }),
  };
}

/** Read a JSON body and validate it. Malformed JSON is a 400 too. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
  where: string
): Promise<Parsed<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: NextResponse.json({ error: "Body must be JSON" }, { status: 400 }) };
  }
  return validate(schema, raw, where);
}
