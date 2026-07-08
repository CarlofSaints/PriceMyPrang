import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can, ALL_PERMISSIONS } from "@/lib/permissions";
import { getRoles, saveRoles, getUsers } from "@/lib/store";
import type { Permission, Role } from "@/lib/types";

function cleanPermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  return ALL_PERMISSIONS.filter((p) => input.includes(p));
}

function slugId(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${base || "role"}_${crypto.randomUUID().slice(0, 6)}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getRoles());
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as { name?: string; permissions?: Permission[] };
  if (!b.name?.trim()) return NextResponse.json({ error: "Role name required" }, { status: 400 });

  const roles = await getRoles();
  if (roles.some((r) => r.name.toLowerCase() === b.name!.trim().toLowerCase()))
    return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });

  const role: Role = {
    id: slugId(b.name.trim()),
    name: b.name.trim(),
    permissions: cleanPermissions(b.permissions),
  };
  roles.push(role);
  await saveRoles(roles);
  return NextResponse.json(role);
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    id?: string;
    name?: string;
    permissions?: Permission[];
  };
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const roles = await getRoles();
  const role = roles.find((r) => r.id === b.id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role.system)
    return NextResponse.json(
      { error: "The Admin role always has full access and can't be edited." },
      { status: 400 }
    );

  if (b.name?.trim()) role.name = b.name.trim();
  if (b.permissions) role.permissions = cleanPermissions(b.permissions);
  await saveRoles(roles);
  return NextResponse.json(role);
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const roles = await getRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role.system)
    return NextResponse.json({ error: "The Admin role can't be deleted." }, { status: 400 });

  const users = await getUsers();
  const inUse = users.filter((u) => u.role === id).length;
  if (inUse > 0)
    return NextResponse.json(
      { error: `${inUse} user(s) still have this role. Reassign them first.` },
      { status: 409 }
    );

  await saveRoles(roles.filter((r) => r.id !== id));
  return NextResponse.json({ ok: true });
}
