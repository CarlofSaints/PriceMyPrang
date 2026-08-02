import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listSuppliersForPanelBeater } from "@/lib/store";
import MySuppliers from "@/components/MySuppliers";

// A workshop's own supplier book. Distinct from /portal/admin/suppliers, which
// is Price my Prang's platform-wide list.
export default async function MySuppliersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canEdit = can(user, "manage_own_suppliers");
  if (!canEdit && !can(user, "view_own_suppliers")) redirect("/portal");

  if (!user.panelBeaterId) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold text-ink">Suppliers</h1>
        <p className="text-ink/60">
          This login isn&apos;t linked to a workshop, so it has no supplier list of its own.
        </p>
      </div>
    );
  }

  const suppliers = await listSuppliersForPanelBeater(user.panelBeaterId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Suppliers</h1>
        <p className="text-ink/60">
          Who you buy parts from. This list is yours alone — no other workshop can see it, and it
          is what the quote builder will offer when a line is a new, used or alternate part.
          {!canEdit && " You have view-only access."}
        </p>
      </div>
      <MySuppliers initial={suppliers} canEdit={canEdit} />
    </div>
  );
}
