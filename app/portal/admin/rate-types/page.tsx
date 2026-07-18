import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getRateTypes } from "@/lib/store";
import RateTypesManager from "@/components/RateTypesManager";

export default async function RateTypesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_rate_types")) redirect("/portal");

  const rateTypes = await getRateTypes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Rate types</h1>
        <p className="text-ink/60">
          Define the rates panel beaters can set for themselves. Anything you add here appears on
          their Rates page.
        </p>
      </div>
      <RateTypesManager initial={rateTypes} />
    </div>
  );
}
