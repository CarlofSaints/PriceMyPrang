"use client";

import { useState } from "react";
import type { Supplier } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

/** Every field on the form. Nothing here is mandatory except the name. */
const BLANK = {
  name: "",
  companyRegNumber: "",
  vatNumber: "",
  address: "",
  phone: "",
  mainContactName: "",
  mainContactPhone: "",
  mainContactEmail: "",
  billingContactName: "",
  billingContactPhone: "",
  billingContactEmail: "",
  supplies: "",
};

type Draft = typeof BLANK;

const draftFrom = (s: Supplier): Draft => ({
  name: s.name ?? "",
  companyRegNumber: s.companyRegNumber ?? "",
  vatNumber: s.vatNumber ?? "",
  address: s.address ?? "",
  phone: s.phone ?? "",
  mainContactName: s.mainContactName ?? "",
  mainContactPhone: s.mainContactPhone ?? "",
  mainContactEmail: s.mainContactEmail ?? "",
  billingContactName: s.billingContactName ?? "",
  billingContactPhone: s.billingContactPhone ?? "",
  billingContactEmail: s.billingContactEmail ?? "",
  supplies: s.supplies ?? "",
});

export default function MySuppliers({
  initial,
  canEdit,
}: {
  initial: Supplier[];
  canEdit: boolean;
}) {
  const [suppliers, setSuppliers] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // null = form closed. "" = adding. An id = editing that supplier.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const q = search.trim().toLowerCase();
  const visible = q
    ? suppliers.filter((s) =>
        `${s.name} ${s.supplies ?? ""} ${s.mainContactName ?? ""}`.toLowerCase().includes(q)
      )
    : suppliers;

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  function openAdd() {
    setDraft(BLANK);
    setEditingId("");
    setError(null);
  }

  function openEdit(s: Supplier) {
    setDraft(draftFrom(s));
    setEditingId(s.id);
    setError(null);
  }

  function close() {
    setEditingId(null);
    setDraft(BLANK);
  }

  async function save() {
    if (!draft.name.trim()) return setError("The supplier's company name is needed.");
    setBusy(true);
    setError(null);
    try {
      const editing = !!editingId;
      const res = await fetch("/api/my-suppliers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editingId, ...draft } : draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the supplier");

      setSuppliers((list) =>
        editing
          ? list.map((s) => (s.id === data.id ? data : s))
          : [...list, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`Remove ${s.name} from your suppliers?`)) return;
    const prev = suppliers;
    setSuppliers((list) => list.filter((x) => x.id !== s.id));
    try {
      const res = await fetch("/api/my-suppliers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
    } catch (err) {
      setSuppliers(prev);
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers…"
          className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm"
        />
        {canEdit && (
          <div className="ml-auto">
            <Button onClick={() => (editingId === "" ? close() : openAdd())}>
              {editingId === "" ? "Cancel" : "Add supplier"}
            </Button>
          </div>
        )}
      </div>

      {/* Add / edit form */}
      {canEdit && editingId !== null && (
        <div className="pmp-card space-y-5 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            {editingId ? "Edit supplier" : "Add a supplier"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Supplier company name" required>
              <input className={inputClass} value={draft.name} onChange={set("name")} autoFocus />
            </Field>
            <Field label="Company registration number">
              <input
                className={inputClass}
                value={draft.companyRegNumber}
                onChange={set("companyRegNumber")}
              />
            </Field>
            <Field label="VAT number">
              <input className={inputClass} value={draft.vatNumber} onChange={set("vatNumber")} />
            </Field>
            <Field label="Phone number">
              <input className={inputClass} value={draft.phone} onChange={set("phone")} />
            </Field>
          </div>

          <Field label="Address">
            <input className={inputClass} value={draft.address} onChange={set("address")} />
          </Field>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
              Main contact
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={draft.mainContactName}
                  onChange={set("mainContactName")}
                />
              </Field>
              <Field label="Number">
                <input
                  className={inputClass}
                  value={draft.mainContactPhone}
                  onChange={set("mainContactPhone")}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={draft.mainContactEmail}
                  onChange={set("mainContactEmail")}
                />
              </Field>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
              Billing contact
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={draft.billingContactName}
                  onChange={set("billingContactName")}
                />
              </Field>
              <Field label="Number">
                <input
                  className={inputClass}
                  value={draft.billingContactPhone}
                  onChange={set("billingContactPhone")}
                />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  value={draft.billingContactEmail}
                  onChange={set("billingContactEmail")}
                />
              </Field>
            </div>
          </div>

          <Field label="What they sell" hint="A brief description — panels, paint, glass, trim…">
            <input className={inputClass} value={draft.supplies} onChange={set("supplies")} />
          </Field>

          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add supplier"}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* The book */}
      {visible.length === 0 ? (
        <div className="pmp-card p-10 text-center text-ink/50">
          {suppliers.length === 0
            ? canEdit
              ? "No suppliers yet. Add the first one."
              : "No suppliers have been added yet."
            : "No suppliers match that search."}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((s) => (
            <div key={s.id} className="pmp-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold text-ink">{s.name}</h3>
                  {s.supplies && <p className="text-sm text-ink/70">{s.supplies}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="text-sm text-teal underline"
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-coral underline"
                      onClick={() => remove(s)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-ink/70 sm:grid-cols-2">
                {s.address && <Detail label="Address" value={s.address} />}
                {s.phone && <Detail label="Phone" value={s.phone} />}
                {s.companyRegNumber && <Detail label="Reg" value={s.companyRegNumber} />}
                {s.vatNumber && <Detail label="VAT" value={s.vatNumber} />}
                {s.mainContactName && <Detail label="Contact" value={s.mainContactName} />}
                {s.mainContactPhone && <Detail label="Contact no." value={s.mainContactPhone} />}
                {s.mainContactEmail && <Detail label="Contact email" value={s.mainContactEmail} />}
                {s.billingContactName && <Detail label="Billing" value={s.billingContactName} />}
                {s.billingContactPhone && <Detail label="Billing no." value={s.billingContactPhone} />}
                {s.billingContactEmail && (
                  <Detail label="Billing email" value={s.billingContactEmail} />
                )}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-ink/40">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
