import type { Permission, RoleName, User } from "./types";

// Default permission sets per role.
export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  admin: [
    "manage_users",
    "manage_panel_beaters",
    "view_dashboard",
    "build_quotes",
    "manage_parts",
  ],
  assessor: ["view_dashboard", "build_quotes", "manage_parts", "manage_panel_beaters"],
  panel_beater: ["onboard_self"],
};

export const ROLE_LABELS: Record<RoleName, string> = {
  admin: "Admin",
  assessor: "Assessor",
  panel_beater: "Panel Beater",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: "Manage users & roles",
  manage_panel_beaters: "Add / edit panel beaters",
  onboard_self: "Edit own panel beater listing",
  view_dashboard: "View dashboard",
  build_quotes: "Build quotations",
  manage_parts: "Manage parts & suppliers",
};

export function permissionsFor(user: Pick<User, "role" | "extraPermissions">): Permission[] {
  const base = ROLE_PERMISSIONS[user.role] ?? [];
  return Array.from(new Set([...base, ...(user.extraPermissions ?? [])]));
}

export function can(
  user: Pick<User, "role" | "extraPermissions"> | null | undefined,
  permission: Permission
): boolean {
  if (!user) return false;
  return permissionsFor(user).includes(permission);
}
