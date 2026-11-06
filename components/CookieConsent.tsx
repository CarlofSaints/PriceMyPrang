"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const CONSENT_KEY = "pmp_analytics_consent";

// An allow-list, so a new page is untracked until someone decides otherwise. Quote, pay and
// agreement links carry a private token in the URL, and those must never reach Google.
const TRACKED_PAGES = new Set(["/", "/privacy", "/terms", "/refunds"]);

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Storage can throw when a browser blocks it. That must never take a page down, so it reads as a no. */
function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return "no";
  }
}

function saveConsent(choice: "yes" | "no" | null) {
  try {
    if (choice) localStorage.setItem(CONSENT_KEY, choice);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    return; // nowhere to keep the choice, so gtag stays off
  }
  window.dispatchEvent(new Event("storage"));
}

function setTrackingOff(off: boolean) {
  (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = off;
}

/** Reads the live URL, not React state, because it must win the race against gtag on Back. */
function syncTracking() {
  setTrackingOff(!TRACKED_PAGES.has(location.pathname) || readConsent() !== "yes");
}

export function CookieConsent() {
  const path = usePathname();
  const consent = useSyncExternalStore(subscribe, readConsent, () => "pending-on-server");
  const tracked = TRACKED_PAGES.has(path);

  // Registered once, before gtag loads, so this runs before gtag's own history listener.
  // Otherwise Back onto a private link could report that URL to Google.
  useEffect(() => {
    if (!GA_ID) return;
    window.addEventListener("popstate", syncTracking, true);
    return () => window.removeEventListener("popstate", syncTracking, true);
  }, []);

  useEffect(() => {
    if (GA_ID) syncTracking();
  }, [path, consent]);

  if (!GA_ID || !tracked) return null;

  if (consent === "yes") {
    return (
      <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
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
        May we use Google Analytics cookies to see how many people visit and which pages they use? Google may
        process this outside South Africa. Nothing changes on the site if you decline.{" "}
        <Link href="/privacy" className="font-semibold text-teal underline">
          Read our privacy policy
        </Link>
      </p>
      <div className="mt-3 flex gap-3">
        <Button type="button" className="flex-1" onClick={() => saveConsent("yes")}>
          Accept
        </Button>
        <Button type="button" className="flex-1" onClick={() => saveConsent("no")}>
          Decline
        </Button>
      </div>
    </aside>
  );
}

/** On the privacy page, so a yes can be taken back. */
export function ChangeCookieChoice() {
  if (!GA_ID) return null;

  function reset() {
    setTrackingOff(true); // first, or gtag can rewrite its cookies as the page unloads
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
