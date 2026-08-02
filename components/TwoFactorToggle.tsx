"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "./ui";

export default function TwoFactorToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const turningOn = !enabled;

  async function apply() {
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: turningOn, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change it");
      setEnabled(data.enabled);
      setConfirming(false);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Two-step sign-in</h2>
        <p className="mt-1 text-sm text-ink/70">
          With this on, signing in also needs a 6-digit code emailed to you. Someone who learns
          your password still can&apos;t get in without your inbox.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-ink/[0.04] px-4 py-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${enabled ? "bg-teal" : "bg-ink/25"}`}
        />
        <span className="text-sm font-semibold text-ink">
          {enabled ? "On" : "Off"}
        </span>
        <span className="text-xs text-ink/50">
          {enabled ? "Codes go to your account email." : "Password only."}
        </span>
      </div>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="space-y-3">
          {turningOn && (
            <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-ink">
              Make sure you can receive email at your account address before turning this on — it
              becomes part of how you sign in.
            </p>
          )}
          <Field label="Your password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={apply}>
              {busy ? "Saving…" : turningOn ? "Turn on" : "Turn off"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setPassword("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          {enabled ? "Turn off two-step sign-in" : "Turn on two-step sign-in"}
        </Button>
      )}
    </div>
  );
}
