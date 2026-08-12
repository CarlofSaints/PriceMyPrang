import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUsers, getPanelBeaters, getRoles, getPanelBeater } from "@/lib/store";
import UsersManager from "@/components/UsersManager";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_users")) redirect("/portal");

  // PMP staff manage everyone. A workshop's own admin manages only their team,
  // and may only hand out panel-beater roles — mirrored server-side in
  // /api/users, which is what actually enforces it.
  const isPlatform = can(user, "manage_panel_beaters");
  const workshopId = isPlatform ? null : user.panelBeaterId;
  if (!isPlatform && !workshopId) redirect("/portal");

  const [allUsers, allPanelBeaters, allRoles] = await Promise.all([
    getUsers(),
    isPlatform ? getPanelBeaters() : Promise.resolve([]),
    getRoles(),
  ]);

  const users = isPlatform
    ? allUsers
    : allUsers.filter((u) => u.panelBeaterId === workshopId);
  const roles = isPlatform ? allRoles : allRoles.filter((r) => r.scope === "panel_beater");

  const safe = users.map(({ passwordHash, ...rest }) => {
    void passwordHash;
    return rest;
  });

  const workshop = workshopId ? await getPanelBeater(workshopId) : null;

  return (
    // Full width of the portal shell, not the max-w-4xl a reading column wants:
    // this page is a data grid, and squeezing seven columns into 896px is what
    // pushed Reset password off the right-hand edge.
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">
          {isPlatform ? "Users & roles" : "Your team"}
        </h1>
        <p className="text-ink/60">
          {isPlatform
            ? "Assessors, admins and panel-beater logins."
            : `Everyone who can sign in for ${
                workshop ? workshop.tradingAs || workshop.companyName : "your workshop"
              }. Add your estimators and buyers here.`}
        </p>
      </div>
      <UsersManager
        initialUsers={safe}
        panelBeaters={allPanelBeaters}
        roles={roles}
        scopedToWorkshop={!isPlatform}
      />
    </div>
  );
}
