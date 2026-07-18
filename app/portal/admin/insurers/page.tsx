import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInsurers, getRateTypes } from "@/lib/store";
import { sortRateTypes } from "@/lib/rateTypes";
import InsurersManager from "@/components/InsurersManager";

export default async function InsurersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_insurers")) redirect("/portal");

  const [insurers, rateTypes] = await Promise.all([getInsurers(), getRateTypes()]);
  const activeRateTypes = sortRateTypes(rateTypes.filter((r) => r.active));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Insurance companies</h1>
        <p className="text-ink/60">
          Add insurers and set each one&apos;s rate card. These rates are shared — every panel
          beater can see and use them, and consumers pick their insurer when requesting a quote.
        </p>
      </div>
      <InsurersManager initial={insurers} rateTypes={activeRateTypes} />
    </div>
  );
}
