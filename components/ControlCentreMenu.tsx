"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./PortalNav";

// Super Admin "Control Centre" — a burger menu in the top bar for PriceMyPrang
// employees. Opens a dropdown of management pages.
export default function ControlCentreMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
          open
            ? "border-teal-light/40 bg-white/15 text-white"
            : "border-white/15 text-white/85 hover:bg-white/10 hover:text-white"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        Control Centre
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-teal/15 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="bg-ink px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-light">
              Control Centre
            </p>
          </div>
          <nav className="p-2">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active ? "bg-teal text-white" : "text-ink/80 hover:bg-teal/8 hover:text-ink"
                  }`}
                >
                  {item.label}
                  <span aria-hidden="true" className={active ? "text-white/80" : "text-ink/30"}>
                    →
                  </span>
                </Link>
              );
            })}
          </nav>
          <p className="border-t border-ink/8 bg-offwhite px-4 py-3 text-xs leading-relaxed text-ink/55">
            Control Centre is only available to Super Admins (Price my Prang employees).
          </p>
        </div>
      )}
    </div>
  );
}
