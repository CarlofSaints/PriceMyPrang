import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can, ALL_PERMISSIONS } from "@/lib/permissions";
import { getRoles, saveRoles, getUsers } from "@/lib/store";
import { logActivity, actorFromUser } from "@/lib/activityLog";
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
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getRoles());
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (!can(user, "manage_roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = (await request.json()) as {
    name?: string;
    permissions?: Permission[];
    scope?: Role["scope"];
  };
  if (!b.name?.trim()) return NextResponse.json({ error: "Role name required" }, { status: 400 });

  const roles = await getRoles();
  // Names only have to be unique within a scope — a workshop's "Admin" and
  // PMP's "Admin" are different jobs and both should be allowed to exist.
  const scope: Role["scope"] = b.scope === "panel_beater" ? "panel_beater" : "platform";
  if (
    roles.some(
      (r) => r.scope === scope && r.name.toLowerCase() === b.name!.trim().toLowerCase()
    )
  )
    return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });

  const role: Role = {
    id: slugId(b.name.trim()),
    name: b.name.trim(),
    permissions: cleanPermissions(b.permissions),
    scope,
  };
  roles.push(role);
  await saveRoles(roles);

  await logActivity({
    action: "role.create",
    summary: `${user.name} created the ${scope === "panel_beater" ? "workshop" : "platform"} role ${role.name}`,
    entityType: "role",
    entityId: role.id,
    entityLabel: role.name,
    ...actorFromUser(user),
    detail: { scope, permissions: role.permissions },
    request,
  });

  return NextResponse.json(role);
}

export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
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

  // Which capabilities were granted and revoked, not merely that "permissions"
  // changed — this endpoint is how someone's reach is widened, so the log has
  // to name what was widened.
  const before = { name: role.name, permissions: [...role.permissions] };
  if (b.name?.trim()) role.name = b.name.trim();
  if (b.permissions) role.permissions = cleanPermissions(b.permissions);
  await saveRoles(roles);

  const granted = role.permissions.filter((p) => !before.permissions.includes(p));
  const revoked = before.permissions.filter((p) => !role.permissions.includes(p));
  await logActivity({
    action: "role.update",
    summary:
      granted.length || revoked.length
        ? `${user.name} changed ${role.name}: ${[
            granted.length ? `granted ${granted.join(", ")}` : "",
            revoked.length ? `revoked ${revoked.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("; ")}`
        : `${user.name} saved the role ${role.name}`,
    entityType: "role",
    entityId: role.id,
    entityLabel: role.name,
    ...actorFromUser(user),
    detail: { granted, revoked, renamedFrom: before.name === role.name ? undefined : before.name },
    request,
  });

  return NextResponse.json(role);
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;
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

  await logActivity({
    action: "role.delete",
    summary: `${user.name} deleted the role ${role.name}`,
    entityType: "role",
    entityId: role.id,
    entityLabel: role.name,
    ...actorFromUser(user),
    detail: { scope: role.scope, permissions: role.permissions },
    request,
  });

  return NextResponse.json({ ok: true });
}
