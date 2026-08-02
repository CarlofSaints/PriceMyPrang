import { NextResponse } from "next/server";
import { requireUser, verifyPassword } from "@/lib/auth";
import { setTwoFactorEnabled } from "@/lib/store";

/**
 * Turn the emailed second factor on or off for your own account.
 *
 * Requires your password either way. Turning it ON from a borrowed unlocked
 * screen would lock the real owner out of their own account; turning it OFF
 * would quietly strip a protection they chose. Both need proof it's them.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { enabled, password } = (await request.json()) as {
    enabled?: boolean;
    password?: string;
  };
  if (typeof enabled !== "boolean")
    return NextResponse.json({ error: "enabled is required" }, { status: 400 });
  if (!password)
    return NextResponse.json({ error: "Enter your password to confirm" }, { status: 400 });

  if (!(await verifyPassword(password, user.passwordHash)))
    return NextResponse.json({ error: "That isn't your password" }, { status: 403 });

  await setTwoFactorEnabled(user.id, enabled);
  return NextResponse.json({ ok: true, enabled });
}
