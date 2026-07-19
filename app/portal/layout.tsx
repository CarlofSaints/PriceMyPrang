import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import PortalNav, { type NavItem } from "@/components/PortalNav";
import ControlCentreMenu from "@/components/ControlCentreMenu";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Top bar — the panel-beater / operational menu.
  const items: NavItem[] = [];
  if (can(user, "view_dashboard")) items.push({ href: "/portal", label: "Dashboard" });
  if (can(user, "build_quotes") || can(user, "onboard_self"))
    items.push({ href: "/portal/new-quote", label: "New quote" });
  if (can(user, "build_quotes")) items.push({ href: "/portal/quote-builder", label: "Quote builder" });
  // A panel-beater login manages their OWN listing from the top bar. Managing the
  // whole network lives in the Control Centre (below).
  if (can(user, "onboard_self") && !can(user, "manage_panel_beaters"))
    items.push({ href: "/portal/panel-beaters", label: "My listing" });
  if (can(user, "manage_panel_beaters") || can(user, "onboard_self"))
    items.push({ href: "/portal/warranties", label: "Warranties" });
  if (can(user, "manage_panel_beaters") || can(user, "onboard_self"))
    items.push({ href: "/portal/rates", label: "Rates" });
  if (can(user, "manage_users")) items.push({ href: "/portal/users", label: "Users" });

  // Left sidebar — Super Admin (PriceMyPrang employee) Control Centre.
  const adminItems: NavItem[] = [];
  if (can(user, "manage_panel_beaters"))
    adminItems.push({ href: "/portal/panel-beaters", label: "Panel beaters" });
  if (can(user, "manage_parts"))
    adminItems.push({ href: "/portal/admin/suppliers", label: "Suppliers" });
  if (can(user, "manage_roles")) adminItems.push({ href: "/portal/admin/roles", label: "Roles" });
  if (can(user, "manage_rate_types"))
    adminItems.push({ href: "/portal/admin/rate-types", label: "Rate types" });
  if (can(user, "manage_insurers"))
    adminItems.push({ href: "/portal/admin/insurers", label: "Insurance companies" });

  return (
    <div className="min-h-dvh bg-offwhite">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo variant="horizontal-dark" className="h-12 w-auto sm:h-16" />
            <PortalNav items={items} />
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <ControlCentreMenu items={adminItems} />
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-teal-light">{user.roleName}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
