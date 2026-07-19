import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSuppliers } from "@/lib/store";
import SuppliersManager from "@/components/SuppliersManager";

export default async function SuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_parts")) redirect("/portal");

  const suppliers = await getSuppliers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Suppliers</h1>
        <p className="text-ink/60">
          The list of parts suppliers — which part types they carry (new, used, alternate), the
          makes they cover, and what they supply.
        </p>
      </div>
      <SuppliersManager initial={suppliers} />
    </div>
  );
}
