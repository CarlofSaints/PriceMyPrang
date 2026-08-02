"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/portal";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Set once the password is accepted but a second factor is outstanding. The
  // password is never held past this point — only the challenge id is.
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");

      if (data.twoFactorRequired) {
        setChallengeId(data.challengeId);
        setPassword(""); // no reason to keep it in memory now
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That code didn't work");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (challengeId) {
    return (
      <form onSubmit={submitCode} className="w-full max-w-sm space-y-4">
        <div className="mb-2 text-center">
          <Logo variant="primary-light" className="mx-auto h-28 w-auto" priority />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Check your email</h1>
          <p className="text-sm text-ink/60">
            We&apos;ve sent a 6-digit code to {email}. It expires in 10 minutes.
          </p>
        </div>

        <Field label="Sign-in code">
          <input
            className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
            value={code}
            // Pasted codes routinely carry a space; strip anything that isn't
            // a digit rather than fail a code the person copied correctly.
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Sign in"}
        </Button>

        <p className="text-center text-sm text-ink/50">
          <button
            type="button"
            className="text-teal hover:underline"
            onClick={() => {
              setChallengeId(null);
              setCode("");
              setError(null);
            }}
          >
            ← Start again
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div className="mb-2 text-center">
        <Logo variant="primary-light" className="mx-auto h-28 w-auto" priority />
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Portal login</h1>
        <p className="text-sm text-ink/60">Assessors & panel beaters</p>
      </div>

      <Field label="Email">
        <input
          className={inputClass}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Field label="Password">
        <input
          className={inputClass}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-ink/50">
        <Link href="/" className="text-teal hover:underline">
          ← Back to Price my Prang
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-offwhite p-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
