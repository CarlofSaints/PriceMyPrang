import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getParts } from "@/lib/store";
import PartsManager from "@/components/PartsManager";

export default async function PartsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_parts")) redirect("/portal");

  const parts = await getParts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Parts & suppliers</h1>
        <p className="text-ink/60">These feed the dropdown in the quote builder.</p>
      </div>
      <PartsManager initial={parts} />
    </div>
  );
}
