import { redirect } from "next/navigation";
import PortalChrome from "@/components/PortalChrome";
import { type NavItem } from "@/components/PortalNav";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Main navigation (left sidebar).
  const items: NavItem[] = [];
  if (can(user, "view_dashboard")) items.push({ href: "/portal", label: "Dashboard" });
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
  if (can(user, "manage_roles")) adminItems.push({ href: "/portal/admin/roles", label: "Roles" });
  if (can(user, "manage_rate_types"))
    adminItems.push({ href: "/portal/admin/rate-types", label: "Rate types" });
  if (can(user, "manage_insurers"))
    adminItems.push({ href: "/portal/admin/insurers", label: "Insurance companies" });

  return (
    <PortalChrome
      items={items}
      adminItems={adminItems}
      userName={user.name}
      roleName={user.roleName}
    >
      {children}
    </PortalChrome>
  );
}
