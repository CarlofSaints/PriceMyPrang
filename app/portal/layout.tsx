import { redirect } from "next/navigation";
import PortalChrome from "@/components/PortalChrome";
import { type NavItem } from "@/components/PortalNav";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import LogoutButton from "@/components/LogoutButton";
import { Logo } from "@/components/Logo";
import { getCurrentUser } from "@/lib/auth";
import { getPanelBeater } from "@/lib/store";
import { can } from "@/lib/permissions";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Still on an admin-issued temporary password: swap the whole portal for the
  // change-password screen. Done by rendering instead of redirecting, so it
  // covers every /portal route without pathname matching or a redirect loop
  // (the layout has to run before any page either way, so it costs nothing).
  if (user.mustChangePassword) {
    return (
      <div className="min-h-dvh bg-offwhite">
        <header className="sticky top-0 z-30 bg-ink">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-5">
            <Logo variant="horizontal-dark" className="h-9 w-auto sm:h-11" />
            <LogoutButton />
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 py-10 sm:py-16">
          <h1 className="font-display text-2xl font-bold text-ink">Choose a password</h1>
          <p className="mt-1 text-sm text-ink/70">
            You&apos;re signed in with a temporary password. Pick your own to carry on to the
            portal.
          </p>
          <div className="pmp-card mt-6">
            <ChangePasswordForm forced />
          </div>
        </main>
      </div>
    );
  }

  // Main navigation (left sidebar).
  const items: NavItem[] = [];
  // Panel-beater logins get a dashboard too — their own work, not the network's.
  if (can(user, "view_dashboard") || (can(user, "onboard_self") && user.panelBeaterId))
    items.push({ href: "/portal", label: "Dashboard" });
  if (can(user, "build_quotes") || can(user, "onboard_self"))
    items.push({ href: "/portal/new-quote", label: "New quote" });
  if (can(user, "build_quotes")) items.push({ href: "/portal/quote-builder", label: "Quote builder" });
  // A panel-beater login manages their OWN listing here; managing the whole
  // network lives in the Control Centre.
  if (can(user, "onboard_self") && !can(user, "manage_panel_beaters"))
    items.push({ href: "/portal/panel-beaters", label: "My listing" });
  if (can(user, "manage_panel_beaters") || can(user, "onboard_self"))
    items.push({ href: "/portal/warranties", label: "Warranties" });
  if (can(user, "manage_panel_beaters") || can(user, "onboard_self"))
    items.push({ href: "/portal/rates", label: "Rates" });
  if (can(user, "manage_users")) items.push({ href: "/portal/users", label: "Users" });

  // Control Centre — Super Admin (PriceMyPrang employee) only.
  const adminItems: NavItem[] = [];
  if (can(user, "manage_panel_beaters"))
    adminItems.push({ href: "/portal/panel-beaters", label: "Panel beaters" });
  if (can(user, "manage_parts"))
    adminItems.push({ href: "/portal/admin/suppliers", label: "Suppliers" });
  if (can(user, "manage_panel_beaters"))
    adminItems.push({ href: "/portal/admin/agreement", label: "Repairer agreement" });
  if (can(user, "manage_roles")) adminItems.push({ href: "/portal/admin/roles", label: "Roles" });
  // Rate types are no longer configurable — the card structure is fixed in
  // lib/rateCard.ts, so there's nothing for an admin to manage.
  if (can(user, "manage_insurers"))
    adminItems.push({ href: "/portal/admin/insurers", label: "Insurance companies" });

  // Vetting is a property of the WORKSHOP, not the login — every user attached
  // to an unapproved panel beater sees this, however many of them there are.
  const workshop = user.panelBeaterId ? await getPanelBeater(user.panelBeaterId) : null;
  const awaitingVetting = !!workshop && workshop.status !== "approved";

  return (
    <PortalChrome
      items={items}
      adminItems={adminItems}
      userName={user.name}
      roleName={user.roleName}
    >
      {awaitingVetting && (
        <div className="mb-6 rounded-2xl border border-coral/30 bg-coral/10 p-4">
          <p className="font-display text-base font-semibold text-ink">
            You have not yet been vetted
          </p>
          <p className="mt-1 text-sm text-ink/70">
            Once your documents have been checked, you will be approved. In the meantime you can
            carry on setting up {workshop.tradingAs || workshop.companyName} — your workshop
            won&apos;t appear to consumers until it&apos;s approved.
          </p>
        </div>
      )}
      {children}
    </PortalChrome>
  );
}
