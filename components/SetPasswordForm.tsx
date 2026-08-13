"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputClass } from "./ui";

/**
 * Choose a password from an emailed link.
 *
 * Both boxes are plain `type="password"` with a single reveal toggle rather
 * than two independently-revealed fields — the confirm box exists to catch a
 * typo, and letting one be visible while the other isn't makes a mismatch
 * impossible to explain.
 */
export default function SetPasswordForm({
  token,
  email,
  purpose,
}: {
  token: string;
  email: string;
  /** "welcome" for a brand-new account, "reset" for an existing one. */
  purpose: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here as well as on the server so a mismatch or a short password
    // doesn't cost a round trip — and, more to the point, doesn't SPEND the
    // link on an attempt that was never going to work.
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two don't match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/public/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">Password set</h1>
        <p className="text-sm text-ink/60">
          You can sign in as <strong className="text-ink">{email}</strong> now.
        </p>
        <Button onClick={() => router.push("/login")}>Go to the portal</Button>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-ink">
          {purpose === "reset" ? "Set a new password" : "Choose your password"}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          for <strong className="text-ink">{email}</strong>
        </p>
      </div>

      <Field label="New password" hint="At least 10 characters.">
        <input
          className={inputClass}
          type={show ? "text" : "password"}
          value={password}
          autoFocus
          autoComplete="new-password"
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          required
        />
      </Field>

      <Field label="Type it again">
        <input
          className={inputClass}
          type={show ? "text" : "password"}
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
          required
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show what I&apos;m typing
      </label>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Save my password"}
      </Button>
    </form>
  );
}
