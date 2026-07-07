"use client";

import { useState } from "react";
import type { PanelBeater, Permission, RoleName, User } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import { PERMISSION_LABELS, ROLE_LABELS } from "@/lib/permissions";

type SafeUser = Omit<User, "passwordHash">;

const ROLES: RoleName[] = ["admin", "assessor", "panel_beater"];
const ALL_PERMS = Object.keys(PERMISSION_LABELS) as Permission[];

export default function UsersManager({
  initialUsers,
  panelBeaters,
}: {
  initialUsers: SafeUser[];
  panelBeaters: PanelBeater[];
}) {
  const [users, setUsers] = useState<SafeUser[]>(initialUsers);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "assessor" as RoleName,
    panelBeaterId: "",
    extraPermissions: [] as Permission[],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const u = (await res.json()) as SafeUser;
      setUsers((list) => [...list, u]);
      setForm({ name: "", email: "", password: "", role: "assessor", panelBeaterId: "", extraPermissions: [] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const u = (await res.json()) as SafeUser;
      setUsers((list) => list.map((x) => (x.id === u.id ? u : x)));
    }
  }

  async function resetPw(id: string) {
    const pw = prompt("New password for this user:");
    if (pw) await patch(id, { password: pw });
  }

  function togglePerm(p: Permission) {
    setForm((f) => ({
      ...f,
      extraPermissions: f.extraPermissions.includes(p)
        ? f.extraPermissions.filter((x) => x !== p)
        : [...f.extraPermissions, p],
    }));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">Add a user</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Temporary password">
            <input className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {form.role === "panel_beater" && (
          <Field label="Link to panel beater listing" hint="Optional — they can also create their own.">
            <select className={inputClass} value={form.panelBeaterId} onChange={(e) => setForm({ ...form, panelBeaterId: e.target.value })}>
              <option value="">— none —</option>
              {panelBeaters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.tradingAs || p.companyName}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Extra permissions (on top of role)</p>
          <div className="flex flex-wrap gap-2">
            {ALL_PERMS.map((p) => (
              <label key={p} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${form.extraPermissions.includes(p) ? "border-teal bg-teal/10 text-teal" : "border-ink/15 text-ink/70"}`}>
                <input type="checkbox" className="hidden" checked={form.extraPermissions.includes(p)} onChange={() => togglePerm(p)} />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-coral">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </Button>
      </form>

      <div className="pmp-card p-0 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-semibold">{u.name}</td>
                <td className="px-4 py-3 text-ink/70">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => resetPw(u.id)} className="text-teal hover:underline">
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
