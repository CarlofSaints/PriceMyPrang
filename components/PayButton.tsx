"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

/** Opens (or resumes) the customer's Ozow payment and sends them to it. */
export default function PayButton({ token, label }: { token: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      const data = (await res.json().catch(() => ({}))) as { kind?: string; url?: string; error?: string; reason?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      if (data.kind === "redirect" && data.url) {
        window.location.href = data.url;
        return; // stay busy: the browser is leaving
      }
      if (data.kind === "voucher_invalid") {
        // Taken off on the server: refresh shows the full price, and the
        // message stays because refresh keeps this component's state.
        setError(`${data.reason ?? "That voucher can no longer be used."} The full price now applies.`);
        setBusy(false);
        router.refresh();
        return;
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
      {/* shortcut: the tick is not recorded on the server; record it with the payment if a dispute ever needs proof */}
      <label className="flex items-start gap-2 text-left text-sm text-ink/80">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" target="_blank" className="underline">Privacy policy</Link>.
        </span>
      </label>
      <Button size="lg" className="w-full" onClick={pay} disabled={busy || !agreed}>
        {busy ? "Opening secure payment…" : label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
