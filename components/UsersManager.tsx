"use client";

import { useState } from "react";
import Link from "next/link";
import type { PanelBeater, Role, User } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

type SafeUser = Omit<User, "passwordHash">;

export default function UsersManager({
  initialUsers,
  panelBeaters,
  roles,
}: {
  initialUsers: SafeUser[];
  panelBeaters: PanelBeater[];
  roles: Role[];
}) {
  const [users, setUsers] = useState<SafeUser[]>(initialUsers);
  const defaultRole = roles.find((r) => r.id === "assessor")?.id || roles[0]?.id || "";
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: defaultRole,
    panelBeaterId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;
  const selectedRole = roles.find((r) => r.id === form.role);
  const roleWantsPanelBeater = selectedRole?.permissions.includes("onboard_self");

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
      setForm({ name: "", email: "", password: "", role: defaultRole, panelBeaterId: "" });
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

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="pmp-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Add a user</h2>
          <Link href="/portal/roles" className="text-sm font-semibold text-teal hover:underline">
            Manage roles →
          </Link>
        </div>
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
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {roleWantsPanelBeater && (
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
                    value={roles.some((r) => r.id === u.role) ? u.role : ""}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm"
                  >
                    {!roles.some((r) => r.id === u.role) && (
                      <option value="">{roleName(u.role)} (removed)</option>
                    )}
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
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
