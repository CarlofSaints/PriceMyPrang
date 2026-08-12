"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import LogoutButton from "./LogoutButton";
import type { NavItem } from "./PortalNav";

export default function PortalChrome({
  items,
  adminItems,
  userName,
  roleName,
  children,
}: {
  items: NavItem[];
  adminItems: NavItem[];
  userName: string;
  roleName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // Start collapsed on small screens.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
  }, []);

  function closeOnMobile() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setOpen(false);
    }
  }

  const isActive = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  const linkClass = (active: boolean) =>
    `block rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
      active ? "bg-teal text-white shadow-sm" : "text-ink/75 hover:bg-teal/10 hover:text-ink"
    }`;

  return (
    <div className="min-h-dvh bg-offwhite">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-ink">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="rounded-lg p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <Logo variant="horizontal-dark" className="h-9 w-auto sm:h-11" />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="whitespace-nowrap text-sm font-semibold text-white">{userName}</p>
              <p className="text-xs text-teal-light">{roleName}</p>
            </div>
            <Link
              href="/portal/change-password"
              className="hidden whitespace-nowrap text-sm font-semibold text-white/70 hover:text-white sm:block"
            >
              Change password
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-4rem)]">
        {/* Backdrop on mobile */}
        {open && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-16 z-30 bg-ink/40 lg:hidden"
          />
        )}

        {/* Left sidebar — collapsible / pop-out */}
        <aside
          className={`fixed bottom-0 left-0 top-16 z-40 w-64 transform overflow-y-auto border-r border-ink/10 bg-white transition-transform lg:static lg:top-0 lg:z-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width] ${
            open
              ? "translate-x-0 lg:w-64"
              : "-translate-x-full lg:w-0 lg:overflow-hidden lg:border-r-0"
          }`}
        >
          <nav className="space-y-1 p-3">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeOnMobile}
                className={linkClass(isActive(item.href))}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {adminItems.length > 0 && (
            <div className="mt-1 border-t border-ink/10 p-3">
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-teal">
                Control Centre
              </p>
              <nav className="space-y-1">
                {adminItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeOnMobile}
                    className={linkClass(isActive(item.href))}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <p className="mt-3 rounded-lg bg-offwhite px-3 py-2 text-xs leading-relaxed text-ink/55">
                Only available to Super Admins (Price my Prang employees).
              </p>
            </div>
          )}

          {/* On phones the top bar has no room for this, so it lives here too. */}
          <div className="border-t border-ink/10 p-3 sm:hidden">
            <Link
              href="/portal/change-password"
              onClick={closeOnMobile}
              className={linkClass(isActive("/portal/change-password"))}
            >
              Change password
            </Link>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {/* 7xl, not 6xl: the users grid needs 1181px and 6xl gave it 1110,
              so it scrolled sideways on a laptop with room to spare beside it.
              Cards and forms inside are fluid, so the extra width costs the
              narrower pages nothing. */}
          <div className="mx-auto max-w-7xl px-5 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
