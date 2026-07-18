import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (can(user, "manage_roles")) redirect("/portal/admin/roles");
  if (can(user, "manage_rate_types")) redirect("/portal/admin/rate-types");
  redirect("/portal");
}
