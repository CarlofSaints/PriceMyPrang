"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-offwhite p-5">
      <div className="w-full max-w-sm space-y-4">
        <Logo variant="primary-light" className="mx-auto h-28 w-auto" priority />

        {done ? (
          // Worded so it reads the same whether or not that address has an
          // account, because the server deliberately doesn't say. Promising
          // "we've sent it" to someone who typed the wrong address would be a
          // lie they then wait on.
          <div className="space-y-4 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">Check your email</h1>
            <p className="text-sm text-ink/60">
              If <strong className="text-ink">{email}</strong> has a Price my Prang login,
              a link to set a new password is on its way. It works for 48 hours.
            </p>
            <p className="text-sm text-ink/60">
              Nothing after a few minutes? Look in your spam or junk folder — and if your
              company filters mail, ask whoever looks after it to let through
              noreply@pricemyprang.co.za.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <h1 className="mt-4 font-display text-2xl font-bold text-ink">
                Forgotten your password?
              </h1>
              <p className="mt-1 text-sm text-ink/60">
                Give us the address you sign in with and we&apos;ll email you a link to set a
                new one.
              </p>
            </div>

            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={email}
                autoFocus
                autoComplete="email"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                required
              />
            </Field>

            {error && (
              <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? "Sending…" : "Email me a link"}
            </Button>

            <p className="text-center text-sm text-ink/50">
              <Link href="/login" className="text-teal hover:underline">
                ← Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
