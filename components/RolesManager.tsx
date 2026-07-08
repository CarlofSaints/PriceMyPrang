"use client";

import { useState } from "react";
import type { Permission, Role } from "@/lib/types";
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_HELP } from "@/lib/permissions";
import { Button, Field, inputClass } from "./ui";

export default function RolesManager({ initial }: { initial: Role[] }) {
  const [roles, setRoles] = useState<Role[]>(initial);
  const [error, setError] = useState<string | null>(null);

  // New role form
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Permission[]>([]);
  const [creating, setCreating] = useState(false);

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, permissions: newPerms }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const role = (await res.json()) as Role;
      setRoles((r) => [...r, role]);
      setNewName("");
      setNewPerms([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function saveRole(role: Role, permissions: Permission[]) {
    setError(null);
    const res = await fetch("/api/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: role.id, permissions }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Role;
      setRoles((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    } else {
      setError((await res.json()).error || "Save failed");
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
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      {/* Existing roles */}
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <RoleCard key={role.id} role={role} onSave={saveRole} onDelete={deleteRole} />
        ))}
      </div>

      {/* Create new role */}
      <form onSubmit={createRole} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">Create a new role</h2>
        <Field label="Role name">
          <input
            className={inputClass}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Senior Assessor"
            required
          />
        </Field>
        <PermissionGrid
          selected={newPerms}
          onToggle={(p) =>
            setNewPerms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))
          }
        />
        <Button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Create role"}
        </Button>
      </form>
    </div>
  );
}

function RoleCard({
  role,
  onSave,
  onDelete,
}: {
  role: Role;
  onSave: (role: Role, permissions: Permission[]) => Promise<void>;
  onDelete: (role: Role) => void;
}) {
  const [perms, setPerms] = useState<Permission[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify([...perms].sort()) !== JSON.stringify([...role.permissions].sort());

  async function save() {
    setSaving(true);
    await onSave(role, perms);
    setSaving(false);
  }

  return (
    <div className="pmp-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink">
          {role.name}
          {role.system && (
            <span className="ml-2 rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">
              built-in
            </span>
          )}
        </h3>
        {!role.system && (
          <button onClick={() => onDelete(role)} className="text-sm text-coral hover:underline">
            Delete
          </button>
        )}
      </div>

      {role.system ? (
        <p className="text-sm text-ink/60">
          The Admin role always has full access to everything and can&apos;t be changed.
        </p>
      ) : (
        <>
          <PermissionGrid
            selected={perms}
            onToggle={(p) =>
              setPerms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))
            }
          />
          <Button size="md" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </>
      )}
    </div>
  );
}

function PermissionGrid({
  selected,
  onToggle,
}: {
  selected: Permission[];
  onToggle: (p: Permission) => void;
}) {
  return (
    <div className="space-y-2">
      {ALL_PERMISSIONS.map((p) => {
        const on = selected.includes(p);
        return (
          <label
            key={p}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              on ? "border-teal bg-teal/5" : "border-ink/10 hover:bg-ink/5"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(p)}
              className="mt-0.5 h-4 w-4 accent-[#00848d]"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{PERMISSION_LABELS[p]}</span>
              {PERMISSION_HELP[p] && (
                <span className="block text-xs text-ink/55">{PERMISSION_HELP[p]}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
