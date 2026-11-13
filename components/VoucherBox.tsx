"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputClass } from "./ui";
import { zar } from "@/lib/format";

export interface AppliedVoucher {
  code: string;
  percentOff: number;
  /** What they'll pay with it, and without. */
  amount: number;
  fee: number;
}

/**
 * "Have a voucher code?", on the quote form and the pay page.
 *
 * - With a `token` (pay page): Apply remembers the voucher on the request and
 *   refreshes the page, which re-renders with the new price.
 * - Without (quote form, before the request exists): Apply only checks the
 *   code and hands it back through `onChange`; the form sends it with the request.
 *
 * Either way the server works the price out again at Pay. `onDraft` reports
 * what's typed but not yet applied, so the form can still send it.
 */
export default function VoucherBox({
  token,
  applied,
  onChange,
  onDraft,
}: {
  token?: string;
  applied: AppliedVoucher | null;
  onChange?: (v: AppliedVoucher | null) => void;
  onDraft?: (text: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function type(text: string) {
    setCode(text);
    onDraft?.(text);
  }

  async function send(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, code: value } : { code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      type("");
      setOpen(false);
      if (token) router.refresh();
      else onChange?.(data.voucher ? { ...data.voucher, amount: data.amount, fee: data.fee } : null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (token) send("");
    else onChange?.(null);
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-teal/10 px-4 py-3 text-left text-sm">
        <span className="text-ink">
          {`Voucher ${applied.code}: ${applied.percentOff}% off. You'll pay ${applied.amount <= 0 ? "nothing" : zar(applied.amount)} instead of ${zar(applied.fee)}.`}
        </span>
        <button type="button" onClick={remove} disabled={busy} className="font-semibold text-teal underline">
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

  // Not a <form>: on the quote form this sits inside the page's own form flow,
  // so Enter is handled here rather than by a nested submit.
  return (
    <div className="space-y-2 text-left">
      <label htmlFor="voucher" className="text-sm font-semibold text-ink">Voucher code</label>
      <div className="flex gap-2">
        <input
          id="voucher"
          value={code}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (code.trim()) send(code);
            }
          }}
          placeholder="PMP-XXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={40}
          className={`${inputClass} font-mono uppercase`}
        />
        <Button type="button" variant="outline" onClick={() => send(code)} disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Apply"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
