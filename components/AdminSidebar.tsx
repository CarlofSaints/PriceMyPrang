"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./PortalNav";

// Super Admin "Control Centre" — always visible on the left for employees who
// can manage roles and/or rate types. The panel-beater menu stays on the top bar.
export default function AdminSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;
  return (
    <aside className="w-full shrink-0 sm:w-56">
      <div className="rounded-2xl border border-teal/15 bg-white p-3">
        <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-teal">
          Control Centre
        </p>
        <nav className="flex flex-row gap-1 overflow-x-auto sm:flex-col">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-teal text-white" : "text-ink/70 hover:bg-teal/5 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
