"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputClass } from "./ui";

/**
 * "Have a voucher?" on the pay page. Applying only remembers the voucher on the
 * request; the page then re-renders with the new price, and the price is worked
 * out again on the server when they press Pay.
 */
export default function VoucherBox({ token, applied }: { token: string; applied: { code: string; percentOff: number } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setCode("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-teal/10 px-4 py-3 text-left text-sm">
        <span className="text-ink">
          Voucher <span className="font-mono font-semibold">{applied.code}</span> applied: {applied.percentOff}% off
        </span>
        <button type="button" onClick={() => send("")} disabled={busy} className="font-semibold text-teal underline">
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-teal underline">
        Have a voucher code?
      </button>
    );
  }

  return (
    <form
      className="space-y-2 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) send(code);
      }}
    >
      <label htmlFor="voucher" className="text-sm font-semibold text-ink">Voucher code</label>
      <div className="flex gap-2">
        <input
          id="voucher"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="PMP-XXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={40}
          className={`${inputClass} font-mono uppercase`}
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Apply"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
