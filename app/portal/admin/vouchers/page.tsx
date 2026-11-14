import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { requestFee } from "@/lib/ozow";
import VouchersManager from "@/components/VouchersManager";
import { zar } from "@/lib/format";

export default async function VouchersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_vouchers")) redirect("/portal");

  const vouchers = await getDb().voucher.findMany({ orderBy: { createdAt: "desc" }, take: 500 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Vouchers</h1>
        <p className="text-ink/60">
          {`Discount codes on the ${zar(requestFee())} request fee. `}The customer types the code on the payment
          page. A use is only counted once their payment goes through, so a code typed in and abandoned
          doesn&apos;t use it up. A 100% voucher skips payment altogether.
        </p>
      </div>
      <VouchersManager
        fee={requestFee()}
        initial={vouchers.map((v) => ({ ...v, expiresAt: v.expiresAt.toISOString(), createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() }))}
      />
    </div>
  );
}
