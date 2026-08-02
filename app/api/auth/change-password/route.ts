import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { setUserPassword } from "@/lib/store";

const MIN_LENGTH = 10;

// Let a signed-in user replace their own password. This is the only way a
// password ever gets set by the person who owns it — everything else on the
// Users page is an admin issuing a temporary one.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword)
    return NextResponse.json(
      { error: "Current and new password required" },
      { status: 400 }
    );

  // Re-check the current password even though they hold a valid session, so a
  // borrowed unlocked screen can't be used to lock the real owner out.
  // Name the likely cause. Bare "incorrect" reads as being locked out, when it
  // usually means the temporary password has already been replaced.
  if (!(await verifyPassword(currentPassword, user.passwordHash)))
    return NextResponse.json(
      {
        error: user.mustChangePassword
          ? "That temporary password doesn't match the one we emailed you."
          : "That isn't your current password. If you've already replaced the temporary one from your welcome email, use the password you set.",
      },
      { status: 403 }
    );

  if (newPassword.length < MIN_LENGTH)
    return NextResponse.json(
      { error: `New password must be at least ${MIN_LENGTH} characters` },
      { status: 400 }
    );
  if (newPassword === currentPassword)
    return NextResponse.json(
      { error: "New password must be different from the current one" },
      { status: 400 }
    );

  // Clears mustChangePassword, which is what releases them from the forced
  // change screen.
  await setUserPassword(user.id, await hashPassword(newPassword), false);

  return NextResponse.json({ ok: true });
}
