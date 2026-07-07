"use client";

import { useState } from "react";
import type { Part } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import { zar } from "@/lib/format";

export default function PartsManager({ initial }: { initial: Part[] }) {
  const [parts, setParts] = useState<Part[]>(initial);
  const [form, setForm] = useState({ supplier: "", name: "", partNumber: "", price: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const part = (await res.json()) as Part;
      setParts((p) => [...p, part]);
      setForm({ supplier: "", name: "", partNumber: "", price: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setParts((p) => p.filter((x) => x.id !== id));
    await fetch("/api/parts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const bySupplier = parts.reduce<Record<string, Part[]>>((acc, p) => {
    (acc[p.supplier] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="pmp-card">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Add a part</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Supplier">
            <input className={inputClass} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
          </Field>
          <Field label="Part name">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Part number">
            <input className={inputClass} value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} />
          </Field>
          <Field label="Price (R)">
            <input className={inputClass} type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
        </div>
        {error && <p className="mt-2 text-sm text-coral">{error}</p>}
        <div className="mt-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add part"}
          </Button>
        </div>
      </form>

      {Object.keys(bySupplier).length === 0 ? (
        <div className="pmp-card text-center text-ink/50">No parts loaded yet.</div>
      ) : (
        Object.entries(bySupplier).map(([supplier, list]) => (
          <div key={supplier} className="pmp-card p-0 overflow-hidden">
            <div className="bg-ink/5 px-4 py-2 font-display font-semibold text-ink">{supplier}</div>
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-ink/5">
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-ink/60">{p.partNumber || "—"}</td>
                    <td className="px-4 py-2 font-semibold">{zar(p.price)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove(p.id)} className="text-coral hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
