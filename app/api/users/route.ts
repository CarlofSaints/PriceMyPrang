import { NextResponse } from "next/server";
import { requireUser, hashPassword, generateTempPassword } from "@/lib/auth";
import { can, permissionsForRole } from "@/lib/permissions";
import {
  getUsers,
  saveUsers,
  getRoles,
  deleteUser,
  setTwoFactorEnabled,
  getPanelBeater,
} from "@/lib/store";
import { sendUserCredentials, sendPanelBeaterWelcome } from "@/lib/email";
import { logActivity, actorFromUser, diff } from "@/lib/activityLog";
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

  await logActivity({
    action: "user.create",
    summary: `${admin.name} created the login ${user.name} (${user.email}) as ${role.name}`,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    ...actorFromUser(admin),
    detail: {
      email: user.email,
      role: role.name,
      panelBeaterId: user.panelBeaterId ?? null,
      mustChangePassword,
      // WHETHER a password was emailed, never the password itself.
      credentialsEmailed: mail.sent,
      emailSkipped: "skipped" in mail,
    },
    request,
  });

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

  // The deleted person's details are COPIED into the line, because after this
  // there is no record left to join back to.
  await logActivity({
    action: "user.delete",
    summary: `${admin.name} deleted the login ${target.name} (${target.email})`,
    entityType: "user",
    entityId: target.id,
    entityLabel: target.name,
    ...actorFromUser(admin),
    detail: {
      email: target.email,
      role: target.role,
      panelBeaterId: target.panelBeaterId ?? null,
    },
    request,
  });

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
    twoFactorEnabled?: boolean;
    /** Re-send the welcome letter, with a freshly issued temporary password. */
    welcome?: boolean;
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

  // Snapshot BEFORE the in-place mutation below, or the diff compares the
  // record with itself and reports nothing changed.
  const before = { role: u.role, active: u.active, twoFactorEnabled: u.twoFactorEnabled };

  if (b.role) {
    const roles = await getRoles();
    const role = roles.find((r) => r.id === b.role);
    if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
    if (!scope.platform && role.scope !== "panel_beater")
      return NextResponse.json({ error: "You can't assign that role" }, { status: 403 });
    u.role = b.role;
  }
  if (typeof b.active === "boolean") u.active = b.active;

  // Two-step sign-in, set by an admin on someone else's behalf.
  //
  // Turning it ON is how a workshop puts its whole team behind a second
  // factor; turning it OFF is the only way back in for someone whose inbox
  // has died, since the codes go to that same address. Both are ordinary
  // admin work, so no password is asked for here — but NOT on your own
  // account: that would let anyone at a signed-in admin's unlocked screen
  // strip the admin's own second factor without knowing their password,
  // which is exactly what /api/auth/two-factor demands a password to stop.
  // Your own toggle lives on /portal/change-password, which asks for it.
  if (typeof b.twoFactorEnabled === "boolean") {
    if (u.id === admin.id) {
      await logActivity({
        action: "user.update",
        summary: `${admin.name} tried to change their own two-step sign-in from the Users page`,
        outcome: "denied",
        status: 403,
        entityType: "user",
        entityId: u.id,
        entityLabel: u.name,
        ...actorFromUser(admin),
        request,
      });
      return NextResponse.json(
        {
          error:
            "Change your own two-step sign-in under “Change password” — it needs your password.",
        },
        { status: 403 }
      );
    }
    u.twoFactorEnabled = b.twoFactorEnabled;
  }

  let mail: { sent: boolean; error?: string } | null = null;
  let skipped = false;

  // ── Resend the welcome letter ───────────────────────────────────────────
  //
  // The one an applicant should have received at registration, or a new user
  // when their login was created. It carries credentials, so it CANNOT be a
  // literal re-send: the original password was hashed the moment it was set
  // and nobody — including us — can read it back. A fresh temporary password
  // is issued and the letter goes out with that instead, which is why this
  // costs the user their current password and forces a change at next sign-in.
  // The UI says so before it is clicked.
  let issuedPassword: string | null = null;
  if (b.welcome) {
    issuedPassword = generateTempPassword();
    u.passwordHash = await hashPassword(issuedPassword);
    u.mustChangePassword = true;

    // A repairer gets the panel-beater welcome — "we have your application,
    // sign in and finish your listing" — not the bare credentials note, which
    // would read as though we had never seen their sign-up.
    const pb = u.panelBeaterId ? await getPanelBeater(u.panelBeaterId) : null;
    mail = pb
      ? await sendPanelBeaterWelcome({
          name: u.name,
          email: u.email,
          password: issuedPassword,
          companyName: pb.tradingAs || pb.companyName,
        })
      : await sendUserCredentials({
          name: u.name,
          email: u.email,
          password: issuedPassword,
          mustChangePassword: true,
        });
  } else if (b.password) {
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

  // Written separately and on purpose: saveUsers() rewrites a fixed set of
  // columns and twoFactorEnabled is not one of them, so assigning it above
  // would look like it saved and quietly change nothing.
  if (typeof b.twoFactorEnabled === "boolean")
    await setTwoFactorEnabled(u.id, b.twoFactorEnabled);

  const changes = diff(before, {
    role: u.role,
    active: u.active,
    twoFactorEnabled: u.twoFactorEnabled,
  });
  // A password reset changes no visible field, so it would leave no trace at
  // all if the log only recorded the diff.
  const changed = [
    ...Object.keys(changes).map((k) =>
      k === "twoFactorEnabled" ? "two-step sign-in" : k === "active" ? "active" : k
    ),
    ...(b.password ? ["password (reset)"] : []),
    ...(b.welcome ? ["welcome email (resent with a new password)"] : []),
  ];

  await logActivity({
    action: b.welcome
      ? "user.welcome.resend"
      : b.password && changed.length === 1
      ? "user.password.reset"
      : "user.update",
    summary: b.welcome
      ? `${admin.name} re-sent the welcome email to ${u.name} (${u.email})` +
        (mail?.sent ? "" : ` — but it did not send${mail?.error ? `: ${mail.error}` : ""}`)
      : changed.length
      ? `${admin.name} changed ${changed.join(", ")} for ${u.name}`
      : `${admin.name} saved ${u.name} with no changes`,
    // A welcome that never left is exactly the failure this whole incident was
    // about, so it must not be filed as a success.
    outcome: b.welcome && !mail?.sent ? "failed" : "success",
    entityType: "user",
    entityId: u.id,
    entityLabel: u.name,
    ...actorFromUser(admin),
    detail: {
      email: u.email,
      changes,
      // Again: whether a password was issued and emailed, never its value.
      passwordReset: !!b.password || !!b.welcome,
      welcomeResent: b.welcome || undefined,
      welcomeEmailed: b.welcome ? !!mail?.sent : undefined,
      welcomeEmailError: b.welcome ? mail?.error : undefined,
      mustChangePassword: b.password ? u.mustChangePassword : undefined,
      credentialsEmailed: b.password ? !!mail?.sent : undefined,
      emailSkipped: skipped || undefined,
    },
    request,
  });

  return NextResponse.json({
    ...scrub(u),
    emailSent: mail?.sent,
    emailError: mail?.error,
    emailSkipped: skipped,
    // Returned ONLY for a welcome resend, and only so the admin can read the
    // password out over the phone when the email did not send — which is the
    // situation that prompted this button existing.
    issuedPassword: issuedPassword ?? undefined,
  });
}
