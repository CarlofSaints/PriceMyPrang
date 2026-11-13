"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "./ui";
import { discountedFee, voucherStatus } from "@/lib/vouchers";
import { zar } from "@/lib/format";

export interface VoucherRow {
  id: string;
  code: string;
  percentOff: number;
  expiresAt: string;
  maxUses: number;
  usesCount: number;
  active: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** Today in South Africa as YYYY-MM-DD, for the date picker's minimum. */
function todaySA(): string {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<string, string> = {
  Active: "bg-teal/10 text-teal",
  "Switched off": "bg-ink/10 text-ink/60",
  Expired: "bg-amber/20 text-ink",
  "Used up": "bg-ink/10 text-ink/60",
};

export default function VouchersManager({ initial, fee }: { initial: VoucherRow[]; fee: number }) {
  const [vouchers, setVouchers] = useState(initial);
  const [percentOff, setPercentOff] = useState("10");
  const [expiresOn, setExpiresOn] = useState("");
  const [multi, setMulti] = useState(false);
  const [maxUses, setMaxUses] = useState("10");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<VoucherRow | null>(null);
  const [copied, setCopied] = useState(false);

  const pct = Number(percentOff);
  const pctOk = Number.isInteger(pct) && pct >= 1 && pct <= 100;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const uses = multi ? Number(maxUses) : 1;
    if (!pctOk) return setError("Discount must be a whole number from 1 to 100.");
    if (!expiresOn) return setError("Pick an expiry date.");
    if (multi && (!Number.isInteger(uses) || uses < 2)) return setError("A multi-use voucher needs at least 2 uses.");
    setBusy(true);
    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentOff: pct, expiresOn, maxUses: uses, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.issues?.[0]?.message || data.error || "Couldn't create the voucher");
      setVouchers((list) => [data as VoucherRow, ...list]);
      setMade(data as VoucherRow);
      setCopied(false);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(v: VoucherRow, active: boolean) {
    setError(null);
    const res = await fetch("/api/vouchers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: v.id, active }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "Couldn't change the voucher");
    setVouchers((list) => list.map((x) => (x.id === v.id ? (data as VoucherRow) : x)));
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">New voucher</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount (%)" hint={pctOk ? `Customer pays ${zar(discountedFee(fee, pct))} instead of ${zar(fee)}${pct === 100 ? ": free, no payment" : ""}` : "1 to 100"}>
            <input type="number" min={1} max={100} step={1} value={percentOff} onChange={(e) => setPercentOff(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Expiry date" hint="Works until the end of this day">
            <input type="date" min={todaySA()} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} required />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Uses</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="uses" checked={!multi} onChange={() => setMulti(false)} /> Single use (one customer)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="uses" checked={multi} onChange={() => setMulti(true)} /> Multi-use
          </label>
          {multi && (
            <div className="max-w-xs pl-6">
              <Field label="How many times can it be used?">
                <input type="number" min={2} max={100000} step={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputClass} required />
              </Field>
            </div>
          )}
        </fieldset>

        <Field label="Note (optional)" hint="For your own reference, e.g. Facebook launch. Customers never see it.">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputClass} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Generating…" : "Generate voucher"}</Button>

        {made && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-teal/10 p-4">
            <span className="text-sm text-ink">New voucher:</span>
            <span className="font-mono text-2xl font-bold tracking-wider text-ink">{made.code}</span>
            <Button type="button" variant="outline" onClick={() => copy(made.code)}>{copied ? "Copied" : "Copy code"}</Button>
          </div>
        )}
      </form>

      <div className="pmp-card overflow-x-auto">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">All vouchers</h2>
        {vouchers.length === 0 ? (
          <p className="text-sm text-ink/60">No vouchers yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Discount</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Used</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Note</th>
                <th className="py-2 pr-4">Made by</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => {
                const status = voucherStatus({ ...v, expiresAt: new Date(v.expiresAt) });
                return (
                  <tr key={v.id} className="border-t border-ink/10">
                    <td className="py-2 pr-4 font-mono font-semibold">{v.code}</td>
                    <td className="py-2 pr-4">{v.percentOff}%</td>
                    <td className="py-2 pr-4">{new Date(v.expiresAt).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" })}</td>
                    <td className="py-2 pr-4">{v.usesCount} of {v.maxUses}{v.maxUses === 1 ? " (single use)" : ""}</td>
                    <td className="py-2 pr-4"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{status}</span></td>
                    <td className="py-2 pr-4 text-ink/70">{v.note}</td>
                    <td className="py-2 pr-4 text-ink/70">{v.createdByName}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => setActive(v, !v.active)} className="text-sm font-semibold text-teal underline">
                        {v.active ? "Switch off" : "Switch back on"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
