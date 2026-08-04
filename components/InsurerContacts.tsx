"use client";

import { useEffect, useState } from "react";
import type { InsuranceCompany, InsurerContact } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

/**
 * Who to talk to at an insurer.
 *
 * One component, two modes, because the rules differ:
 *  - mode "generic" (PMP staff) writes contacts EVERY workshop can see.
 *  - mode "own"     (a workshop) writes contacts only that workshop sees, and
 *    shows the generic ones read-only so they know what they already have.
 *
 * The server enforces both; this only decides what to draw.
 */
export default function InsurerContacts({
  insurers,
  mode,
}: {
  insurers: InsuranceCompany[];
  mode: "generic" | "own";
}) {
  const [insurerId, setInsurerId] = useState(insurers[0]?.id ?? "");
  const [contacts, setContacts] = useState<InsurerContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const blank = { name: "", role: "", email: "", phone: "", notes: "" };
  const [form, setForm] = useState(blank);

  const insurer = insurers.find((i) => i.id === insurerId);

  async function load(id: string) {
    if (!id) return setContacts([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/insurers/contacts?insurerId=${encodeURIComponent(id)}`);
      setContacts(res.ok ? await res.json() : []);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(insurerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insurerId]);

  async function add() {
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      setError("Give the contact a name, an email or a phone number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insurers/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insurerId, generic: mode === "generic", ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save that contact.");
        return;
      }
      setContacts((list) => [...list, data as InsurerContact]);
      setForm(blank);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: InsurerContact) {
    const what = c.name || c.email || "this contact";
    if (
      !confirm(
        c.panelBeaterId
          ? `Remove ${what} from your contacts?`
          : `Remove ${what}?\n\nIt disappears for EVERY workshop on the platform.`
      )
    )
      return;
    const res = await fetch(`/api/insurers/contacts?id=${encodeURIComponent(c.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Couldn't remove that contact.");
      return;
    }
    setContacts((list) => list.filter((x) => x.id !== c.id));
  }

  /** In "own" mode a generic contact is visible but not editable. */
  const canEdit = (c: InsurerContact) =>
    mode === "generic" ? !c.panelBeaterId : !!c.panelBeaterId;

  return (
    <div className="space-y-4">
      <Field label="Insurer">
        <select
          className={inputClass}
          value={insurerId}
          onChange={(e) => setInsurerId(e.target.value)}
        >
          {insurers.length === 0 && <option value="">No insurers yet</option>}
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>

      {insurer && (
        <>
          <div className="rounded-xl border border-ink/10">
            {loading ? (
              <p className="px-4 py-4 text-sm text-ink/50">Loading…</p>
            ) : contacts.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink/50">
                No contacts saved for {insurer.name} yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">
                        {c.name || c.email || "Unnamed contact"}
                        {c.panelBeaterId ? (
                          <span className="ml-2 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal">
                            yours
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/60">
                            shared
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-ink/60">
                        {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {c.notes && <div className="mt-0.5 text-xs italic text-ink/50">{c.notes}</div>}
                      {!c.email && (
                        <div className="mt-0.5 text-xs text-amber">
                          No email — additionals can&apos;t be sent to this one.
                        </div>
                      )}
                    </div>
                    {canEdit(c) && (
                      <button
                        onClick={() => remove(c)}
                        className="text-sm font-semibold text-coral hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl bg-offwhite p-4">
            <p className="mb-1 text-sm font-semibold text-ink">
              {mode === "generic" ? "Add a shared contact" : "Add your own contact"}
            </p>
            <p className="mb-3 text-xs text-ink/60">
              {mode === "generic"
                ? "Every workshop on the platform will see this one."
                : `Only ${"your workshop"} sees this. Use it for the handler you actually deal with at ${insurer.name}.`}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={inputClass}
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Role, e.g. Claims handler"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className={`${inputClass} sm:col-span-2`}
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {error && <p className="mt-2 text-sm text-coral">{error}</p>}
            <div className="mt-3">
              <Button type="button" onClick={add} disabled={busy}>
                {busy ? "Saving…" : "Add contact"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
