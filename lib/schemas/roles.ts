import { z } from "zod";

// Request bodies for /api/roles (components/RolesManager.tsx). See
// lib/validate.ts for why every object here is strict.
//
// Permission names are plain strings, not an enum: the route already keeps
// only the ones in ALL_PERMISSIONS, and RolesManager posts back a role's
// stored list, which may still hold a retired name. Refusing that would make
// the tick box un-clickable rather than tidy the list.
const permissions = z.array(z.string().max(100)).max(200);

/**
 * POST /api/roles.
 *
 * Never set: id (slugged from the name), system (only the built-in Admin role
 * has it, and it can't be edited or deleted).
 */
export const CreateRoleBody = z.strictObject({
  name: z.string().max(200).optional(),
  permissions: permissions.optional(),
  scope: z.enum(["platform", "panel_beater"]).optional(),
});

/**
 * PATCH /api/roles. id selects the role.
 *
 * Never set: system, scope (a role doesn't move between platform and
 * workshop once people hold it).
 */
export const UpdateRoleBody = z.strictObject({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  permissions: permissions.optional(),
});

/** DELETE /api/roles. Never set: anything but the id. */
export const DeleteRoleBody = z.strictObject({
  id: z.string().max(200).optional(),
});
