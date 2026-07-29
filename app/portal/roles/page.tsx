import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can, PERMISSION_LABELS, PERMISSION_HELP, permissionsForRole } from "@/lib/permissions";
import { getRoles } from "@/lib/store";
import type { Permission } from "@/lib/types";

/**
 * Read-only view of the panel-beater roles, for a workshop's own people.
 *
 * Editing roles stays a Super Admin job (/portal/admin/roles) — a workshop
 * assigning its team is not the same as redefining what a role can do. But
 * they do need to see what they're handing out.
 */
export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Anyone who can edit roles belongs on the editable page instead.
  if (can(user, "manage_roles")) redirect("/portal/admin/roles");
  if (!can(user, "onboard_self")) redirect("/portal");

  const roles = (await getRoles()).filter((r) => r.scope === "panel_beater");
  const permissions = Object.keys(PERMISSION_LABELS) as Permission[];

  // Only show capabilities at least one of these roles actually has —
  // platform-only permissions are noise to a workshop.
  const relevant = permissions.filter((p) =>
    roles.some((r) => permissionsForRole(r.id, roles).includes(p))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Roles &amp; permissions</h1>
        <p className="text-ink/60">
          What each role in your team can do. Assign them on the{" "}
          <span className="font-semibold text-ink">Users</span> page. These are set by Price my
          Prang and can&apos;t be changed here.
        </p>
      </div>

      <div className="pmp-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Can…</th>
                {roles.map((r) => (
                  <th key={r.id} className="px-4 py-3 text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {relevant.length === 0 && (
                <tr>
                  <td colSpan={roles.length + 1} className="px-4 py-10 text-center text-ink/50">
                    No roles have been set up yet.
                  </td>
                </tr>
              )}
              {relevant.map((p) => (
                <tr key={p}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink">{PERMISSION_LABELS[p]}</span>
                    {PERMISSION_HELP[p] && (
                      <span className="block text-xs text-ink/50">{PERMISSION_HELP[p]}</span>
                    )}
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-4 py-3 text-center">
                      {permissionsForRole(r.id, roles).includes(p) ? (
                        <span className="text-teal" aria-label="yes">
                          ✓
                        </span>
                      ) : (
                        <span className="text-ink/20" aria-label="no">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-ink/50">
        Need a role changed, or a new one? Ask Price my Prang — roles are shared across every
        workshop on the panel.
      </p>
    </div>
  );
}
