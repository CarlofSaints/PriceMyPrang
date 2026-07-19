"use client";

import { useState } from "react";
import type { PartType, Supplier } from "@/lib/types";
import { PART_TYPES } from "@/lib/types";
import { MANUFACTURERS } from "@/lib/manufacturers";
import { Button, Field, inputClass } from "./ui";

export default function SuppliersManager({ initial }: { initial: Supplier[] }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initial);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [name, setName] = useState("");
  const [partTypes, setPartTypes] = useState<PartType[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [supplies, setSupplies] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);

  async function createSupplier(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, partTypes, makes, supplies, email, phone }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const supplier = (await res.json()) as Supplier;
      setSuppliers((list) => [...list, supplier]);
      setName("");
      setPartTypes([]);
      setMakes([]);
      setSupplies("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, changes: Partial<Supplier>) {
    const prev = suppliers;
    setSuppliers((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)));
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as Supplier;
      setSuppliers((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setSuppliers(prev);
      setError((err as Error).message);
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    if (!confirm(`Delete "${supplier.name}"?`)) return;
    setError(null);
    const res = await fetch("/api/suppliers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: supplier.id }),
    });
    if (res.ok) setSuppliers((list) => list.filter((s) => s.id !== supplier.id));
    else setError((await res.json()).error || "Delete failed");
  }

  return (
    <div className="space-y-5">
      {/* Shared make suggestions */}
      <datalist id="supplier-makes">
        {MANUFACTURERS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      {/* Add a supplier */}
      <form onSubmit={createSupplier} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">Add a supplier</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" required>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ABC Auto Spares"
              required
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">Part types supplied</span>
            <PartTypePicker value={partTypes} onChange={setPartTypes} />
          </div>
        </div>
        <Field label="Makes covered" hint="Add the vehicle makes they supply for — or type “All”.">
          <MakesInput makes={makes} onChange={setMakes} />
        </Field>
        <Field label="What they supply" hint="Free text — e.g. body panels, bumpers, lights, mechanical.">
          <input
            className={inputClass}
            value={supplies}
            onChange={(e) => setSupplies(e.target.value)}
            placeholder="What parts do they supply?"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Adding…" : "+ Add supplier"}
        </Button>
      </form>

      {/* Existing suppliers */}
      {suppliers.length === 0 ? (
        <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">No suppliers yet.</p>
      ) : (
        suppliers.map((s) => (
          <SupplierCard
            key={s.id}
            supplier={s}
            onPatch={(changes) => patch(s.id, changes)}
            onDelete={() => deleteSupplier(s)}
          />
        ))
      )}
    </div>
  );
}

function PartTypePicker({
  value,
  onChange,
}: {
  value: PartType[];
  onChange: (v: PartType[]) => void;
}) {
  function toggle(t: PartType) {
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {PART_TYPES.map((t) => {
        const on = value.includes(t.value);
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => toggle(t.value)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              on ? "border-teal bg-teal text-white" : "border-teal/20 bg-white text-ink hover:bg-teal/5"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MakesInput({ makes, onChange }: { makes: string[]; onChange: (m: string[]) => void }) {
  const [text, setText] = useState("");
  function add(v: string) {
    const s = v.trim();
    if (!s) return;
    if (!makes.some((m) => m.toLowerCase() === s.toLowerCase())) onChange([...makes, s]);
    setText("");
  }
  return (
    <div>
      {makes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {makes.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-sm font-semibold text-teal"
            >
              {m}
              <button type="button" onClick={() => onChange(makes.filter((x) => x !== m))} aria-label={`Remove ${m}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={inputClass}
          list="supplier-makes"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder="Type a make and press Enter"
        />
        <Button type="button" variant="outline" size="md" onClick={() => add(text)}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SupplierCard({
  supplier,
  onPatch,
  onDelete,
}: {
  supplier: Supplier;
  onPatch: (changes: Partial<Supplier>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`pmp-card space-y-4 ${supplier.active ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${inputClass} flex-1 min-w-[200px] font-semibold`}
          defaultValue={supplier.name}
          key={supplier.id}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== supplier.name) onPatch({ name: v });
            else e.target.value = supplier.name;
          }}
          aria-label="Supplier name"
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#00848d]"
            checked={supplier.active}
            onChange={(e) => onPatch({ active: e.target.checked })}
          />
          Active
        </label>
        <button type="button" onClick={onDelete} className="text-xs font-semibold text-coral hover:underline">
          Delete
        </button>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">
          Part types
        </span>
        <PartTypePicker value={supplier.partTypes} onChange={(partTypes) => onPatch({ partTypes })} />
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">
          Makes covered
        </span>
        <MakesInput makes={supplier.makes} onChange={(makes) => onPatch({ makes })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">
            What they supply
          </span>
          <input
            className={inputClass}
            defaultValue={supplier.supplies ?? ""}
            key={`${supplier.id}-supplies`}
            onBlur={(e) => {
              if (e.target.value.trim() !== (supplier.supplies ?? "")) onPatch({ supplies: e.target.value });
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">Email</span>
            <input
              className={inputClass}
              type="email"
              defaultValue={supplier.email ?? ""}
              key={`${supplier.id}-email`}
              onBlur={(e) => {
                if (e.target.value.trim() !== (supplier.email ?? "")) onPatch({ email: e.target.value });
              }}
            />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink/50">Phone</span>
            <input
              className={inputClass}
              defaultValue={supplier.phone ?? ""}
              key={`${supplier.id}-phone`}
              onBlur={(e) => {
                if (e.target.value.trim() !== (supplier.phone ?? "")) onPatch({ phone: e.target.value });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
