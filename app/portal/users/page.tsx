import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getUsers, getPanelBeaters, getRoles } from "@/lib/store";
import UsersManager from "@/components/UsersManager";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_users")) redirect("/portal");

  const [users, panelBeaters, roles] = await Promise.all([
    getUsers(),
    getPanelBeaters(),
    getRoles(),
  ]);
  const safe = users.map(({ passwordHash, ...rest }) => {
    void passwordHash;
    return rest;
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Users & roles</h1>
        <p className="text-ink/60">Assessors, admins and panel-beater logins.</p>
      </div>
      <UsersManager initialUsers={safe} panelBeaters={panelBeaters} roles={roles} />
    </div>
  );
}
