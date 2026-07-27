import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUsers, saveUsers, getRoles } from "@/lib/store";
import { sendUserCredentials } from "@/lib/email";
import type { User } from "@/lib/types";

function scrub(u: User) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_users")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json((await getUsers()).map(scrub));
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const roles = await getRoles();
  const role = roles.find((r) => r.id === b.role);
  if (!role) return NextResponse.json({ error: "Unknown role" }, { status: 400 });

  const users = await getUsers();
  if (users.some((u) => u.email.toLowerCase() === b.email!.toLowerCase()))
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user: User = {
    id: crypto.randomUUID(),
    name: b.name,
    email: b.email,
    passwordHash: await hashPassword(b.password),
    role: b.role,
    panelBeaterId: b.panelBeaterId || undefined,
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

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const users = await getUsers();
  const u = users.find((x) => x.id === b.id);
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.role) {
    const roles = await getRoles();
    if (!roles.some((r) => r.id === b.role))
      return NextResponse.json({ error: "Unknown role" }, { status: 400 });
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
