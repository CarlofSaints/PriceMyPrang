"use client";

import { useState } from "react";
import type { Permission, Role } from "@/lib/types";
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_HELP } from "@/lib/permissions";
import { Button, Field, inputClass } from "./ui";

export default function RolesManager({ initial }: { initial: Role[] }) {
  const [roles, setRoles] = useState<Role[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Add-role form
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  function hasPerm(role: Role, p: Permission): boolean {
    return role.id === "admin" || role.permissions.includes(p);
  }

  async function toggle(role: Role, p: Permission) {
    if (role.system) return;
    const next = role.permissions.includes(p)
      ? role.permissions.filter((x) => x !== p)
      : [...role.permissions, p];

    // optimistic
    setRoles((rs) => rs.map((r) => (r.id === role.id ? { ...r, permissions: next } : r)));
    setSavingId(role.id);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: role.id, permissions: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as Role;
      setRoles((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      // revert
      setRoles((rs) => rs.map((r) => (r.id === role.id ? role : r)));
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, permissions: [] }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const role = (await res.json()) as Role;
      setRoles((r) => [...r, role]);
      setNewName("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteRole(role: Role) {
    if (!confirm(`Delete the "${role.name}" role?`)) return;
    setError(null);
    const res = await fetch("/api/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: role.id }),
    });
    if (res.ok) setRoles((rs) => rs.filter((r) => r.id !== role.id));
    else setError((await res.json()).error || "Delete failed");
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      <div className="pmp-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-ink/5">
                <th className="sticky left-0 z-10 bg-[#eef4f4] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
                  Permission
                </th>
                {roles.map((role) => (
                  <th key={role.id} className="min-w-[120px] px-3 py-3 text-center align-bottom">
                    <div className="font-display text-sm font-semibold text-ink">{role.name}</div>
                    {role.system ? (
                      <div className="text-[10px] font-normal text-teal">full access</div>
                    ) : (
                      <button
                        onClick={() => deleteRole(role)}
                        className="text-[10px] font-normal text-coral hover:underline"
                      >
                        delete
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p} className="hover:bg-teal/5">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <div className="font-semibold text-ink">{PERMISSION_LABELS[p]}</div>
                    {PERMISSION_HELP[p] && (
                      <div className="text-xs text-ink/50">{PERMISSION_HELP[p]}</div>
                    )}
                  </td>
                  {roles.map((role) => {
                    const on = hasPerm(role, p);
                    const locked = role.system || savingId === role.id;
                    return (
                      <td key={role.id} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          onChange={() => toggle(role, p)}
                          aria-label={`${PERMISSION_LABELS[p]} for ${role.name}`}
                          className="h-5 w-5 cursor-pointer accent-[#00848d] disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-ink/50">
        Changes save automatically. The <strong>Admin</strong> role always has full access and can&apos;t be changed.
      </p>

      {/* Add a role */}
      <form onSubmit={createRole} className="pmp-card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Field label="Add a role" hint="Creates a new column — then tick its permissions.">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Senior Assessor"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={creating}>
          {creating ? "Adding…" : "+ Add role"}
        </Button>
      </form>
    </div>
  );
}
