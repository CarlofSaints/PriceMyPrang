import { redirect } from "next/navigation";

// Roles moved into the Super Admin Control Centre.
export default function LegacyRolesRedirect() {
  redirect("/portal/admin/roles");
}
