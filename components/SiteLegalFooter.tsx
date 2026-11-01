"use client";

import { usePathname } from "next/navigation";
import { LegalFooter } from "./LegalPage";

/** Terms, Privacy and Refunds on every public page. The home page has its own footer; the portal is behind a login. */
export function SiteLegalFooter() {
  const path = usePathname();
  if (path === "/" || path.startsWith("/portal")) return null;
  return <LegalFooter />;
}
