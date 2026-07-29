import { NextResponse } from "next/server";
import { requireUser, hashPassword } from "@/lib/auth";
import { can, permissionsForRole } from "@/lib/permissions";
import { getUsers, saveUsers, getRoles, deleteUser } from "@/lib/store";
import { sendUserCredentials } from "@/lib/email";
import type { AuthUser, User } from "@/lib/types";

function scrub(u: User) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}

/**
 * Whose users this caller may touch.
 *
 * PMP staff (manage_panel_beaters) manage everyone. A workshop's own admin
 * holds manage_users too, but only over their own team — so everything below
 * filters by, and forces, their panelBeaterId. Without this, "manage_users"
 * would hand every workshop admin the entire platform's user list.
 */
function scopeFor(
  admin: AuthUser
): { platform: true } | { platform: false; panelBeaterId: string } | null {
  if (can(admin, "manage_panel_beaters")) return { platform: true };
  if (admin.panelBeaterId) return { platform: false, panelBeaterId: admin.panelBeaterId };
  return null;
}

const FORBIDDEN = NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_users")) return FORBIDDEN;

  const scope = scopeFor(user);
  if (!scope) return FORBIDDEN;

  const users = await getUsers();
  const visible = scope.platform
    ? users
    : users.filter((u) => u.panelBeaterId === scope.panelBeaterId);

  return NextResponse.json(visible.map(scrub));
}

export async function POST(request: Request) {
  const { user: admin, response } = await requireUser();
  if (response) return response;
  if (!can(admin, "manage_users")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    panelBeaterId?: string;
    sendEmail?: boolean;
    mustChangePassword?: boolean;
  };
  if (!b.name || !b.email || !b.password || !b.role)
    return NextResponse.json({ error: "name, email, password, role required" }, { status: 400 });

  // Both default ON: an admin has to opt out of emailing, and opt out of
  // forcing the change. Older clients that don't send the fields keep the
  // safer behaviour.
  const sendEmail = b.sendEmail !== false;
  const mustChangePassword = b.mustChangePassword !== false;

  const scope = scopeFor(admin);
  if (!scope) return FORBIDDEN;

  const roles = await getRoles();
  const role = roles.find((r) => r.id === b.role);
  if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });

  // A workshop admin can only ever create their own team, in their own
  // workshop: platform roles would grant reach beyond it.
  if (!scope.platform && role.scope !== "panel_beater")
    return NextResponse.json({ error: "You can't assign that role" }, { status: 403 });

  // A panel-beater role detached from a workshop is a login that can't do
  // anything — no dashboard, no team, no rates. Refuse rather than create it.
  if (scope.platform && role.scope === "panel_beater" && !b.panelBeaterId)
    return NextResponse.json(
      { error: "Choose which panel beater this user belongs to." },
      { status: 400 }
    );

  const users = await getUsers();
  if (users.some((u) => u.email.toLowerCase() === b.email!.toLowerCase()))
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user: User = {
    id: crypto.randomUUID(),
    name: b.name,
    email: b.email,
    passwordHash: await hashPassword(b.password),
    role: b.role,
    panelBeaterId: scope.platform ? b.panelBeaterId || undefined : scope.panelBeaterId,
    active: true,
    mustChangePassword,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);

  // Email the new user their login details, unless the admin opted out and
  // intends to hand the password over themselves.
  const mail = sendEmail
    ? await sendUserCredentials({
        name: user.name,
        email: user.email,
        password: b.password,
        roleName: role.name,
        mustChangePassword,
      })
    : { sent: false, skipped: true as const };

  return NextResponse.json({
    ...scrub(user),
    emailSent: mail.sent,
    emailError: "error" in mail ? mail.error : undefined,
    emailSkipped: "skipped" in mail,
  });
}

export async function DELETE(request: Request) {
  const { user: admin, response } = await requireUser();
  if (response) return response;
  if (!can(admin, "manage_users")) return FORBIDDEN;

  const scope = scopeFor(admin);
  if (!scope) return FORBIDDEN;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Deleting your own login locks you out of the portal you're standing in.
  if (id === admin.id)
    return NextResponse.json(
      { error: "You can't delete your own login." },
      { status: 400 }
    );

  const users = await getUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Same as PATCH: another workshop's user is a 404, not a 403.
  if (!scope.platform && target.panelBeaterId !== scope.panelBeaterId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Don't allow the last person who can administer the platform to be removed
  // — there'd be no way back in to put one back.
  const roles = await getRoles();
  const isPlatformAdmin = (u: User) =>
    u.active && permissionsForRole(u.role, roles).includes("manage_panel_beaters");
  if (isPlatformAdmin(target) && users.filter(isPlatformAdmin).length <= 1)
    return NextResponse.json(
      { error: "This is the last administrator — promote someone else first." },
      { status: 409 }
    );

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const { user: admin, response } = await requireUser();
  if (response) return response;
  if (!can(admin, "manage_users")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    id?: string;
    role?: string;
    active?: boolean;
    password?: string;
    sendEmail?: boolean;
    mustChangePassword?: boolean;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const scope = scopeFor(admin);
  if (!scope) return FORBIDDEN;

  const users = await getUsers();
  const u = users.find((x) => x.id === b.id);
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reaching a user outside your workshop is a 404, not a 403 — a workshop
  // admin shouldn't be able to probe for who exists elsewhere.
  if (!scope.platform && u.panelBeaterId !== scope.panelBeaterId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.role) {
    const roles = await getRoles();
    const role = roles.find((r) => r.id === b.role);
    if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
    if (!scope.platform && role.scope !== "panel_beater")
      return NextResponse.json({ error: "You can't assign that role" }, { status: 403 });
    u.role = b.role;
  }
  if (typeof b.active === "boolean") u.active = b.active;
  let mail: { sent: boolean; error?: string } | null = null;
  let skipped = false;
  if (b.password) {
    // An admin-issued password is temporary by default — the user is made to
    // replace it on their next visit to the portal.
    const mustChangePassword = b.mustChangePassword !== false;
    u.passwordHash = await hashPassword(b.password);
    u.mustChangePassword = mustChangePassword;
    if (b.sendEmail !== false) {
      mail = await sendUserCredentials({
        name: u.name,
        email: u.email,
        password: b.password,
        isReset: true,
        mustChangePassword,
      });
    } else {
      skipped = true;
    }
  }

  await saveUsers(users);
  return NextResponse.json({
    ...scrub(u),
    emailSent: mail?.sent,
    emailError: mail?.error,
    emailSkipped: skipped,
  });
}
