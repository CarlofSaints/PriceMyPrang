import type { Permission, Role } from "./types";

// Capabilities are code-defined (each maps to a feature). Which role HAS which
// capability is data, edited on the Roles page.
export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_roles: "Manage roles & permissions",
  manage_rate_types: "Manage rate types",
  manage_users: "Manage users",
  manage_panel_beaters: "Add / edit panel beaters",
  onboard_self: "Edit own panel beater listing",
  view_dashboard: "View dashboard & requests",
  build_quotes: "Build quotations",
  manage_parts: "Manage parts & suppliers",
};

export const PERMISSION_HELP: Partial<Record<Permission, string>> = {
  manage_roles: "Create and edit roles and their permissions.",
  manage_rate_types: "Super Admin: define the rate types panel beaters fill in on the Rates page.",
  manage_users: "Create users and assign their role.",
  view_dashboard: "See the dashboard cards and all quote requests.",
  build_quotes: "Use the quote builder and generate PDF quotes.",
  manage_parts: "Import and manage the parts catalogue.",
  manage_panel_beaters: "Onboard and edit panel beaters, approve applications.",
  onboard_self: "A panel-beater login editing only their own listing.",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

// Seeded on first run; the Admin role is a protected superuser.
export const DEFAULT_ROLES: Role[] = [
  { id: "admin", name: "Admin", system: true, permissions: [...ALL_PERMISSIONS] },
  {
    id: "assessor",
    name: "Assessor",
    permissions: ["view_dashboard", "build_quotes", "manage_parts", "manage_panel_beaters"],
  },
  { id: "panel_beater", name: "Panel Beater", permissions: ["onboard_self"] },
];

/** Resolve a role id to its permission list. The Admin role always has all. */
export function permissionsForRole(roleId: string, roles: Role[]): Permission[] {
  const role = roles.find((r) => r.id === roleId);
  if (!role) return [];
  if (role.id === "admin") return [...ALL_PERMISSIONS];
  return role.permissions;
}

/** Check a resolved (logged-in) user for a permission. */
export function can(
  user: { permissions?: Permission[] } | null | undefined,
  permission: Permission
): boolean {
  return !!user && (user.permissions?.includes(permission) ?? false);
}
