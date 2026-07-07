import { NextResponse } from "next/server";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUsers, saveUsers } from "@/lib/store";
import type { Permission, RoleName, User } from "@/lib/types";

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
    role?: RoleName;
    extraPermissions?: Permission[];
    panelBeaterId?: string;
  };
  if (!b.name || !b.email || !b.password || !b.role)
    return NextResponse.json({ error: "name, email, password, role required" }, { status: 400 });

  const users = await getUsers();
  if (users.some((u) => u.email.toLowerCase() === b.email!.toLowerCase()))
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user: User = {
    id: crypto.randomUUID(),
    name: b.name,
    email: b.email,
    passwordHash: await hashPassword(b.password),
    role: b.role,
    extraPermissions: b.extraPermissions,
    panelBeaterId: b.panelBeaterId || undefined,
    active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await saveUsers(users);
  return NextResponse.json(scrub(user));
}

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(admin, "manage_users")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    id?: string;
    role?: RoleName;
    active?: boolean;
    extraPermissions?: Permission[];
    password?: string;
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const users = await getUsers();
  const u = users.find((x) => x.id === b.id);
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.role) u.role = b.role;
  if (typeof b.active === "boolean") u.active = b.active;
  if (b.extraPermissions) u.extraPermissions = b.extraPermissions;
  if (b.password) u.passwordHash = await hashPassword(b.password);

  await saveUsers(users);
  return NextResponse.json(scrub(u));
}
