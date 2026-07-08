"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { netPrice, type Part } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import { zar } from "@/lib/format";

export default function PartsManager({ initial }: { initial: Part[] }) {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>(initial);

  // ---- Import ----
  const [importSupplier, setImportSupplier] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runImport() {
    setImportErr(null);
    setImportMsg(null);
    const file = fileRef.current?.files?.[0];
    if (!importSupplier.trim()) return setImportErr("Enter the supplier name first.");
    if (!file) return setImportErr("Choose an Excel file to import.");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("supplier", importSupplier.trim());
      fd.append("file", file);
      const res = await fetch("/api/parts/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportMsg(`Imported ${data.added} part${data.added === 1 ? "" : "s"} for ${data.supplier}.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      // Optimistically reflect — full list refreshes via router.
      window.location.reload();
    } catch (err) {
      setImportErr((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // ---- Manual add ----
  const [form, setForm] = useState({
    supplier: "",
    partNumber: "",
    name: "",
    category: "",
    listPrice: "",
    discount: "",
    leadTime: "",
  });
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
        body: JSON.stringify({
          supplier: form.supplier,
          partNumber: form.partNumber,
          name: form.name,
          category: form.category,
          listPrice: Number(form.listPrice),
          discountPercentage: form.discount ? Number(form.discount) : undefined,
          avgLeadTime: form.leadTime,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const part = (await res.json()) as Part;
      setParts((p) => [...p, part]);
      setForm({ supplier: form.supplier, partNumber: "", name: "", category: "", listPrice: "", discount: "", leadTime: "" });
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

  // ---- Filters ----
  const [supplierFilter, setSupplierFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const suppliers = useMemo(
    () => Array.from(new Set(parts.map((p) => p.supplier))).sort(),
    [parts]
  );
  const categories = useMemo(
    () => Array.from(new Set(parts.map((p) => p.category).filter(Boolean))).sort() as string[],
    [parts]
  );
  const filtered = parts.filter(
    (p) =>
      (!supplierFilter || p.supplier === supplierFilter) &&
      (!categoryFilter || p.category === categoryFilter)
  );

  const previewNet = netPrice(Number(form.listPrice) || 0, Number(form.discount) || 0);

  return (
    <div className="space-y-6">
      {/* Import */}
      <div className="pmp-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Import parts from Excel</h2>
          <a
            href="/api/parts/template"
            className="text-sm font-semibold text-teal hover:underline"
          >
            ⬇ Download template
          </a>
        </div>
        <p className="mt-1 text-sm text-ink/60">
          The file has no supplier column — pick the supplier here and it&apos;s applied to every row.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Supplier name">
            <input
              className={inputClass}
              value={importSupplier}
              onChange={(e) => setImportSupplier(e.target.value)}
              placeholder="e.g. Bosch SA"
            />
          </Field>
          <Field label="Excel file (.xlsx)">
            <input ref={fileRef} className={inputClass} type="file" accept=".xlsx,.xls" />
          </Field>
          <div className="flex items-end">
            <Button onClick={runImport} disabled={importing}>
              {importing ? "Importing…" : "Import parts"}
            </Button>
          </div>
        </div>
        {importMsg && <p className="mt-2 text-sm text-teal">{importMsg}</p>}
        {importErr && <p className="mt-2 text-sm text-coral">{importErr}</p>}
      </div>

      {/* Manual add */}
      <form onSubmit={add} className="pmp-card">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Add a part manually</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <input className={inputClass} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
          </Field>
          <Field label="Part number">
            <input className={inputClass} value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} />
          </Field>
          <Field label="Category">
            <input className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Bumper, Fender…" />
          </Field>
          <Field label="Part name / description">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="List price (R)">
            <input className={inputClass} type="number" step="0.01" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} />
          </Field>
          <Field label="Discount %">
            <input className={inputClass} type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
          </Field>
          <Field label="Ave lead time">
            <input className={inputClass} value={form.leadTime} onChange={(e) => setForm({ ...form, leadTime: e.target.value })} placeholder="5 days" />
          </Field>
          <div className="sm:col-span-2 flex items-end text-sm text-ink/60">
            Net price:&nbsp;<span className="font-semibold text-ink">{zar(previewNet)}</span>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-coral">{error}</p>}
        <div className="mt-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add part"}
          </Button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Filter by supplier">
          <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Filter by category">
          <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <p className="pb-3 text-sm text-ink/50">{filtered.length} part{filtered.length === 1 ? "" : "s"}</p>
      </div>

      {/* Grid */}
      <div className="pmp-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Part #</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">List</th>
                <th className="px-4 py-3 text-right">Disc %</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3">Lead time</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-ink/50">
                    No parts yet — import a file or add one above.
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-teal/5">
                  <td className="px-4 py-2 font-semibold">{p.supplier}</td>
                  <td className="px-4 py-2 text-ink/70">{p.partNumber || "—"}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.category || "—"}</td>
                  <td className="px-4 py-2 text-right">{p.listPrice ? zar(p.listPrice) : "—"}</td>
                  <td className="px-4 py-2 text-right">{p.discountPercentage ? `${p.discountPercentage}%` : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold">{zar(p.price)}</td>
                  <td className="px-4 py-2 text-ink/70">{p.avgLeadTime || "—"}</td>
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
      </div>
    </div>
  );
}
