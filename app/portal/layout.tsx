import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import PortalNav, { type NavItem } from "@/components/PortalNav";
import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items: NavItem[] = [];
  if (can(user, "view_dashboard")) items.push({ href: "/portal", label: "Dashboard" });
  if (can(user, "build_quotes")) items.push({ href: "/portal/quote-builder", label: "Quote builder" });
  if (can(user, "manage_panel_beaters") || can(user, "onboard_self"))
    items.push({ href: "/portal/panel-beaters", label: "Panel beaters" });
  if (can(user, "manage_parts")) items.push({ href: "/portal/parts", label: "Parts" });
  if (can(user, "manage_users")) items.push({ href: "/portal/users", label: "Users" });

  return (
    <div className="min-h-dvh bg-offwhite">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo variant="horizontal-dark" className="h-8 w-auto" />
            <PortalNav items={items} />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-teal-light">{ROLE_LABELS[user.role]}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
