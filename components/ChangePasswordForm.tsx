"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputClass } from "./ui";

const MIN_LENGTH = 10;

/**
 * Change-your-own-password form. Used in two places:
 *  - /portal/change-password, chosen voluntarily from the top bar
 *  - the forced screen the portal layout shows while mustChangePassword is set
 */
export default function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here as well as server-side so the mismatch case never costs a
    // round trip.
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not change password");
      }
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      // Re-render the server layout so the forced screen lets go.
      router.refresh();
      if (forced) router.push("/portal");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {done && !forced && (
        <p className="rounded-xl border border-teal/30 bg-teal/10 p-3 text-sm text-teal">
          Password changed. Use it next time you sign in.
        </p>
      )}

      <Field label={forced ? "Temporary password" : "Current password"}>
        <input
          className={inputClass}
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="New password" hint={`At least ${MIN_LENGTH} characters.`}>
        <input
          className={inputClass}
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="Confirm new password">
        <input
          className={inputClass}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>

      {error && <p className="text-sm text-coral">{error}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : forced ? "Set my password and continue" : "Change password"}
      </Button>
    </form>
  );
}
