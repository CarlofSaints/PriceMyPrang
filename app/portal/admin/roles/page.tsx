import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRoles } from "@/lib/store";
import RolesManager from "@/components/RolesManager";

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_roles")) redirect("/portal");

  const roles = await getRoles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Roles &amp; permissions</h1>
        <p className="text-ink/60">
          Define what each role can do. Users are assigned one role, which grants these permissions.
        </p>
      </div>
      <RolesManager initial={roles} />
    </div>
  );
}
