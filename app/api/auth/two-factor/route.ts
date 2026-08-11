import { NextResponse } from "next/server";
import { requireUser, verifyPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { setTwoFactorEnabled } from "@/lib/store";
import { logActivity, actorFromUser } from "@/lib/activityLog";

/**
 * Turn the emailed second factor on or off for your own account.
 *
 * Requires your password either way. Turning it ON from a borrowed unlocked
 * screen would lock the real owner out of their own account; turning it OFF
 * would quietly strip a protection they chose. Both need proof it's them.
 *
 * Switching it OFF additionally needs admin rights. Two-step is a control the
 * business sets, not a personal preference: once an admin has turned it on for
 * someone, that person opting themselves back out would undo it silently. So
 * anyone may raise their own protection, and only an admin may lower it —
 * which is also the answer for a phished user whose attacker would otherwise
 * disable the factor as their first move.
 *
 * Admins keep the self-service OFF path deliberately. It is the only way one
 * can lower their own, since /api/users refuses a self-toggle without a
 * password, and losing it would leave an admin permanently unable to.
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

  if (!enabled && !can(user, "manage_users")) {
    await logActivity({
      action: "auth.two_factor.change",
      summary: `${user.name} tried to switch their own two-step sign-in off without the rights to`,
      outcome: "denied",
      status: 403,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      ...actorFromUser(user),
      request,
    });
    return NextResponse.json(
      {
        error:
          "Only an administrator can switch two-step sign-in off. Ask yours if you can't receive the codes.",
      },
      { status: 403 }
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await logActivity({
      action: "auth.two_factor.change",
      summary: `${user.name} gave the wrong password when changing their two-step sign-in`,
      outcome: "denied",
      status: 403,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      ...actorFromUser(user),
      request,
    });
    return NextResponse.json({ error: "That isn't your password" }, { status: 403 });
  }

  await setTwoFactorEnabled(user.id, enabled);
  await logActivity({
    action: "auth.two_factor.change",
    summary: `${user.name} switched their own two-step sign-in ${enabled ? "on" : "off"}`,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    ...actorFromUser(user),
    detail: { enabled, self: true },
    request,
  });
  return NextResponse.json({ ok: true, enabled });
}
