"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputClass } from "./ui";

/**
 * Reading and accepting the repairer agreement. The typed name is the
 * signature; the server records when, and from where, it was given.
 */
export default function AgreementSigner({
  token,
  companyName,
}: {
  token: string;
  companyName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign() {
    if (!name.trim()) return setError("Type your full name to sign.");
    if (!accepted) return setError("Tick the box to confirm you accept the agreement.");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/agreement/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signerName: name, signerTitle: title, accepted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't record your signature. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach us just then. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pmp-card space-y-4">
      <h2 className="font-display text-xl font-bold text-ink">Sign the agreement</h2>
      <p className="text-sm text-ink/70">
        By signing you confirm that you have read and accept this agreement on behalf of{" "}
        <strong>{companyName}</strong>, and that you are authorised to bind the business.
      </p>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your full name" required hint="This is your signature.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jerome Sagathevan"
          />
        </Field>
        <Field label="Your title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Managing Director"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#00848d]"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          I have read and accept the Terms &amp; Conditions, disclaimers, non-disclosure
          obligations and service level agreement set out above.
        </span>
      </label>

      <Button onClick={sign} disabled={busy} size="lg">
        {busy ? "Signing…" : "Sign agreement"}
      </Button>

      <p className="text-xs text-ink/50">
        Your name, the date and time, and your IP address are recorded as evidence of signature.
        You&apos;ll be emailed a signed copy.
      </p>
    </div>
  );
}
