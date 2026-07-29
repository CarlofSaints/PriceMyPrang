import type { Permission, Role } from "./types";

// Capabilities are code-defined (each maps to a feature). Which role HAS which
// capability is data, edited on the Roles page.
export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_roles: "Manage roles & permissions",
  manage_insurers: "Manage insurance companies",
  manage_users: "Manage users",
  manage_panel_beaters: "Add / edit panel beaters",
  onboard_self: "Edit own panel beater listing",
  view_dashboard: "View dashboard & requests",
  build_quotes: "Build quotations",
  manage_parts: "Manage suppliers",
};

export const PERMISSION_HELP: Partial<Record<Permission, string>> = {
  manage_roles: "Create and edit roles and their permissions.",
  manage_insurers: "Super Admin: add insurance companies and set their shared rate cards.",
  manage_users: "Create users and assign their role.",
  view_dashboard: "See the dashboard cards and all quote requests.",
  build_quotes: "Use the quote builder and generate PDF quotes.",
  manage_parts: "Maintain the list of parts suppliers (part types, makes covered, what they supply).",
  manage_panel_beaters: "Onboard and edit panel beaters, approve applications.",
  onboard_self: "A panel-beater login editing only their own listing.",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

// Seeded on first run; the Admin role is a protected superuser.
export const DEFAULT_ROLES: Role[] = [
  // ---- PMP's own staff ----
  // Named "Site Admin", not "Admin": a workshop has an admin too, and a list
  // showing "Admin" twice tells you nothing about which one you're looking at.
  {
    id: "admin",
    name: "Site Admin",
    system: true,
    scope: "platform",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: "assessor",
    name: "Assessor",
    scope: "platform",
    permissions: ["view_dashboard", "build_quotes", "manage_parts", "manage_panel_beaters"],
  },

  // ---- A panel beater's own team ----
  // manage_users here is scoped to the workshop, never the whole platform: see
  // the panel-beater branch in /api/users. Permissions beyond this are still to
  // be decided; Estimator and Buyer currently differ in name only.
  {
    id: "pb_admin",
    name: "Panel Beater Admin",
    scope: "panel_beater",
    permissions: ["onboard_self", "manage_users"],
  },
  { id: "pb_estimator", name: "Estimator", scope: "panel_beater", permissions: ["onboard_self"] },
  { id: "pb_buyer", name: "Buyer", scope: "panel_beater", permissions: ["onboard_self"] },
];

/** The role every self-registered workshop's first two logins get. */
export const PANEL_BEATER_ADMIN_ROLE = "pb_admin";

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
