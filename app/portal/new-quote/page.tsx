import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import NewQuoteClient from "@/components/NewQuoteClient";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "onboard_self") && !can(user, "build_quotes") && !can(user, "manage_panel_beaters"))
    redirect("/portal");

  return <NewQuoteClient />;
}
