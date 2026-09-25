"use client";

import { useState } from "react";
import { Button } from "./ui";

/** Opens (or resumes) the customer's Ozow payment and sends them to it. */
export default function PayButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    // Locked before the first await, so a double tap can't open two payments.
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as { kind?: string; url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      if (data.kind === "redirect" && data.url) {
        window.location.href = data.url;
        return; // stay busy: the browser is leaving
      }
      // Paid, pending or switched off: this page knows how to show each.
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={pay} disabled={busy}>
        {busy ? "Opening secure payment…" : label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
