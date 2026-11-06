"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CONSENT_KEY = "pmp_analytics_consent";

// An allow-list, so a new page is untracked until someone decides otherwise. Quote, pay and
// agreement links carry a private token in the URL, and those must never reach Google.
const TRACKED_PAGES = new Set(["/", "/privacy", "/terms", "/refunds"]);

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function useConsent() {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(CONSENT_KEY),
    () => "pending-on-server",
  );
}

function saveConsent(choice: "yes" | "no" | null) {
  if (choice) localStorage.setItem(CONSENT_KEY, choice);
  else localStorage.removeItem(CONSENT_KEY);
  window.dispatchEvent(new Event("storage"));
}

export function CookieConsent() {
  const path = usePathname();
  const consent = useConsent();
  const tracked = TRACKED_PAGES.has(path);

  // gtag stays in memory after a client-side move to another page, so switch it off there.
  useEffect(() => {
    if (GA_ID) (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !tracked;
  }, [tracked]);

  if (!GA_ID || !tracked) return null;

  if (consent === "yes") {
    return (
      <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
        </Script>
      </>
    );
  }
  if (consent !== null) return null;

  return (
    <aside
      aria-label="Cookie choice"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-xl border border-teal/20 bg-white p-4 text-sm text-ink shadow-lg"
    >
      <p>
        May we use Google Analytics cookies to see how many people visit and which pages they use? Nothing changes
        on the site if you decline.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => saveConsent("yes")}
          className="flex-1 rounded-lg bg-teal px-4 py-2 font-semibold text-white"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => saveConsent("no")}
          className="flex-1 rounded-lg bg-teal px-4 py-2 font-semibold text-white"
        >
          Decline
        </button>
      </div>
    </aside>
  );
}

/** On the privacy page, so a yes can be taken back. */
export function ChangeCookieChoice() {
  if (!GA_ID) return null;

  function reset() {
    const domain = location.hostname.replace(/^www\./, "");
    for (const cookie of document.cookie.split("; ")) {
      const name = cookie.split("=")[0];
      if (name.startsWith("_ga")) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
    }
    saveConsent(null);
    location.reload(); // the only way to drop gtag once it has loaded
  }

  return (
    <button type="button" onClick={reset} className="font-semibold text-teal underline">
      Change my cookie choice
    </button>
  );
}
