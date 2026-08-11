import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logActivity, actorFromUser } from "@/lib/activityLog";

export async function POST(request: Request) {
  // Read the user BEFORE the session is destroyed, or there is nobody to
  // attribute the sign-out to.
  const user = await getCurrentUser();

  await destroySession();

  if (user) {
    await logActivity({
      action: "auth.logout",
      summary: `${user.name} signed out`,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.name,
      ...actorFromUser(user),
      request,
    });
  }

  return NextResponse.json({ ok: true });
}
