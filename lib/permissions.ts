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
  manage_dev_tickets: "Manage the dev planner",
  manage_integrations: "Manage integration keys",
  manage_additionals:
    "Raise extra work found after stripping a vehicle, price it off the job's rate card, and send it to the insurer and client for approval.",
  manage_own_suppliers: "Manage own suppliers",
  view_own_suppliers: "View own suppliers",
  manage_own_complaints: "See and answer complaints against us",
  manage_complaints: "Manage all complaints",
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
  manage_dev_tickets:
    "Super Admin: log development work, set its priority and reminders, and attach documents. Not visible to panel beaters.",
  manage_integrations:
    "Super Admin: set the third-party API keys the platform bills against (currently the imagin8 VIN lookup). Revealing a key requires re-entering your own password.",
  manage_own_suppliers:
    "A workshop maintaining its OWN book of parts suppliers — add, edit, remove. Typically the buyer. Never shows another workshop's suppliers.",
  view_own_suppliers:
    "See the workshop's own supplier list without being able to change it — enough to source a part while quoting.",
  manage_own_complaints:
    "A workshop reading complaints made against it and recording how each was put right. Never shows another workshop's complaints.",
  manage_complaints:
    "Super Admin: every complaint across the network, including internal notes the repairer never sees.",
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
    permissions: ["view_dashboard", "build_quotes", "manage_parts", "manage_panel_beaters", "manage_complaints", "manage_additionals"],
  },

  // ---- A panel beater's own team ----
  // manage_users here is scoped to the workshop, never the whole platform: see
  // the panel-beater branch in /api/users. Permissions beyond this are still to
  // be decided; Estimator and Buyer currently differ in name only.
  {
    id: "pb_admin",
    name: "Panel Beater Admin",
    scope: "panel_beater",
    permissions: ["onboard_self", "manage_users", "manage_own_suppliers", "manage_own_complaints", "manage_additionals"],
  },
  // The first real difference between these two. Sourcing parts is the buyer's
  // job, so the buyer keeps the supplier book and the estimator reads it while
  // quoting. Until now they differed in name only.
  {
    id: "pb_estimator",
    name: "Estimator",
    scope: "panel_beater",
    permissions: ["onboard_self", "view_own_suppliers", "manage_additionals"],
  },
  {
    id: "pb_buyer",
    name: "Buyer",
    scope: "panel_beater",
    permissions: ["onboard_self", "manage_own_suppliers"],
  },
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
