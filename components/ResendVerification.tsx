"use client";

import { useState } from "react";
import { Button } from "./ui";

/** The only action available while an address is unconfirmed: send it again. */
export default function ResendVerification() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send it");
      // Already confirmed in another tab — a reload drops them into the portal.
      if (data.alreadyVerified) return window.location.reload();
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}
      {state === "sent" ? (
        <p className="rounded-xl border border-teal/30 bg-teal/10 p-3 text-sm text-teal">
          Sent. Check your inbox — and your spam folder, since it&apos;s the first mail
          we&apos;ve sent you.
        </p>
      ) : (
        <Button type="button" onClick={resend} disabled={state === "busy"}>
          {state === "busy" ? "Sending…" : "Send the link again"}
        </Button>
      )}
      <p className="text-xs text-ink/50">
        Already clicked it? Reload this page.
      </p>
    </div>
  );
}
