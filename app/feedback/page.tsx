"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass } from "@/components/ui";

// Step one: they type their reference, we email a link to the address already
// on the job. The reference alone is never enough — PMP-date-SURNAME-nn is
// guessable, so it names a job rather than proving you own one.
export default function FeedbackStartPage() {
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/feedback/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMessage(data.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-offwhite p-5">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo variant="primary-light" className="mx-auto h-24 w-auto" priority />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">
            Rate your repair
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Tell us how your repairer did — or raise a problem if something went wrong.
          </p>
        </div>

        {message ? (
          <div className="pmp-card space-y-3 p-6 text-center">
            <p className="text-sm text-ink/80">{message}</p>
            <p className="text-xs text-ink/50">
              The link lasts 48 hours. Check your spam folder if it hasn&apos;t arrived in a
              few minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="pmp-card space-y-4 p-6">
            <Field
              label="Your reference number"
              hint="On every email we've sent you — it looks like PMP-20260802-SMITH-01."
              required
            >
              <input
                className={`${inputClass} font-mono`}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PMP-…"
                autoFocus
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

            <p className="text-xs text-ink/50">
              We&apos;ll send a one-time link to the email address on your job. That way nobody
              else can leave feedback in your name.
            </p>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-ink/50">
          <Link href="/" className="text-teal hover:underline">
            ← Back to Price my Prang
          </Link>
        </p>
      </div>
    </main>
  );
}
