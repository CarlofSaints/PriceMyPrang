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
  scopedToWorkshop = false,
}: {
  initialUsers: SafeUser[];
  panelBeaters: PanelBeater[];
  roles: Role[];
  /**
   * True when a workshop admin is managing their own team. The workshop is then
   * implicit — the server forces it — so there's nothing to pick.
   */
  scopedToWorkshop?: boolean;
}) {
  const [users, setUsers] = useState<SafeUser[]>(initialUsers);
  const defaultRole = scopedToWorkshop
    ? roles.find((r) => r.id === "pb_estimator")?.id || roles[0]?.id || ""
    : roles.find((r) => r.id === "assessor")?.id || roles[0]?.id || "";
  const blankForm = {
    name: "",
    email: "",
    password: "",
    role: defaultRole,
    panelBeaterId: "",
    sendEmail: true,
    mustChangePassword: true,
  };
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name || id;
  const workshopName = (id: string) => {
    const pb = panelBeaters.find((p) => p.id === id);
    // A linked workshop we can't name means the listing was deleted out from
    // under the login — worth showing rather than rendering a blank cell.
    return pb ? pb.tradingAs || pb.companyName : "Unknown workshop";
  };
  const selectedRole = roles.find((r) => r.id === form.role);
  // Scope is now explicit on the role, so this no longer has to be inferred
  // from whether it happens to carry onboard_self.
  const isPanelBeaterRole = selectedRole?.scope === "panel_beater";

  type UserResponse = SafeUser & {
    emailSent?: boolean;
    emailError?: string;
    emailSkipped?: boolean;
  };

  /** What to tell the admin about a password they just issued. */
  function passwordNotice(
    u: UserResponse,
    password: string,
    what: "created" | "reset"
  ): { ok: boolean; text: string } {
    const subject = what === "created" ? "User created" : "Password reset";
    if (u.emailSkipped)
      return {
        ok: true,
        text: `${subject} — no email sent. Give them this password yourself: ${password}`,
      };
    if (u.emailSent)
      return {
        ok: true,
        text:
          what === "created"
            ? `User created — login details emailed to ${u.email}.`
            : `Password reset — new details emailed to ${u.email}.`,
      };
    return {
      ok: false,
      text: `${subject}, but the email didn't send${u.emailError ? ` (${u.emailError})` : ""}. Share the password with them manually: ${password}`,
    };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const u = (await res.json()) as UserResponse;
      setUsers((list) => [...list, u]);
      setNotice(passwordNotice(u, form.password, "created"));
      setForm(blankForm);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Delete a login for good. Named for what it does — the row disappears only
   * once the server has confirmed it, so a refused delete doesn't leave the
   * table lying about who still exists.
   */
  async function remove(u: SafeUser) {
    if (
      !confirm(
        `Delete ${u.name} (${u.email})?\n\nThis removes their login permanently. It does not delete the panel beater listing.`
      )
    )
      return;

    setError(null);
    setNotice(null);
    const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't delete that user.");
      return;
    }
    setUsers((list) => list.filter((x) => x.id !== u.id));
    setNotice({ ok: true, text: `${u.email} deleted.` });
  }

  async function patch(id: string, patch: Record<string, unknown>): Promise<UserResponse | null> {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      const u = (await res.json()) as UserResponse;
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, ...u } : x)));
      return u;
    }
    // The row's controls are driven by state the server confirmed, so a refused
    // change snaps back on its own. Say why, or that looks like a broken tick box.
    const data = await res.json().catch(() => ({}));
    setNotice({ ok: false, text: data.error || "Couldn't save that change." });
    return null;
  }

  /**
   * Turn the emailed second factor on or off for someone else.
   *
   * Confirmed both ways, because both directions can bite. ON sends every
   * future sign-in through their inbox — if mail doesn't reach that address
   * they can't get in at all, and an address we've never verified is exactly
   * the case to say out loud. OFF drops a protection the user may have chosen
   * for themselves on their own Security page.
   */
  async function setTwoFactor(u: SafeUser, enabled: boolean) {
    const warning = enabled
      ? `Turn on two-step sign-in for ${u.name}?\n\nEvery sign-in will then need a 6-digit code emailed to ${u.email}.${
          u.emailVerifiedAt
            ? ""
            : "\n\n⚠ That address has never been verified — if mail doesn't reach it, they won't be able to sign in."
        }`
      : `Turn off two-step sign-in for ${u.name}?\n\nTheir password alone will get them in again.`;
    if (!confirm(warning)) return;

    const res = await patch(u.id, { twoFactorEnabled: enabled });
    if (res)
      setNotice({
        ok: true,
        text: enabled
          ? `Two-step sign-in is on for ${u.email} — it applies from their next sign-in.`
          : `Two-step sign-in is off for ${u.email}.`,
      });
  }

  async function resetPw(id: string) {
    const pw = prompt("New temporary password for this user:");
    if (!pw) return;
    // A reset always forces them to pick their own afterwards; the only choice
    // is whether we email it or the admin hands it over.
    const sendEmail = confirm(
      `Email this password to the user?\n\nOK — email it to them.\nCancel — don't email; it'll be shown here for you to pass on.`
    );
    const u = await patch(id, { password: pw, sendEmail, mustChangePassword: true });
    if (u) setNotice(passwordNotice(u, pw, "reset"));
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p
          className={`rounded-xl border p-3 text-sm ${
            notice.ok
              ? "border-teal/30 bg-teal/10 text-teal"
              : "border-amber/50 bg-amber/20 text-ink"
          }`}
        >
          {notice.text}
        </p>
      )}
      <form onSubmit={create} className="pmp-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Add a user</h2>
          <Link href="/portal/roles" className="text-sm font-semibold text-teal hover:underline">
            {scopedToWorkshop ? "What each role can do →" : "Manage roles →"}
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
            {/* Grouped by whose org chart the role belongs to: PMP has an
                "Admin" and so does every workshop, and the two are nothing
                alike. Ungrouped, the list showed "Admin" twice. */}
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required>
              {scopedToWorkshop ? (
                roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              ) : (
                <>
                  <optgroup label="Price my Prang staff">
                    {roles
                      .filter((r) => r.scope !== "panel_beater")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Panel beater team">
                    {roles
                      .filter((r) => r.scope === "panel_beater")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </optgroup>
                </>
              )}
            </select>
          </Field>
        </div>

        {isPanelBeaterRole && !scopedToWorkshop && (
          <Field
            label="Which panel beater?"
            required
            hint="A panel-beater role only works attached to a workshop."
          >
            <select
              className={inputClass}
              value={form.panelBeaterId}
              onChange={(e) => setForm({ ...form, panelBeaterId: e.target.value })}
              required
            >
              <option value="">Choose a workshop…</option>
              {[...panelBeaters]
                .sort((a, b) =>
                  (a.tradingAs || a.companyName).localeCompare(b.tradingAs || b.companyName)
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tradingAs || p.companyName}
                  </option>
                ))}
            </select>
          </Field>
        )}

        <div className="space-y-2 rounded-xl bg-offwhite p-3">
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.sendEmail}
              onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })}
            />
            <span>
              Email the login details to the user
              <span className="block text-xs text-ink/60">
                Uncheck to hand the password over yourself — it&apos;ll be shown here once after
                you create them.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.mustChangePassword}
              onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })}
            />
            <span>
              Make them choose their own password on first sign-in
              <span className="block text-xs text-ink/60">
                They see nothing but the change-password screen until they do.
              </span>
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-coral">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create user"}
        </Button>
      </form>

      {/* overflow-x-auto, and a min-width on the table, because seven columns
          do not fit a laptop with the sidebar open. Without both, the last
          column — Reset password and Delete — was squeezed to nothing and then
          CLIPPED by overflow-hidden, with no scrollbar to reach it: on 12 Aug
          2026 that left a Super Admin unable to reset a locked-out repairer's
          password at all. Every other table in the app already does this. */}
      <div className="pmp-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-ink/5 text-xs uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              {/* Pointless on a workshop's own Team page — they'd all say the
                  same thing. Only PMP staff see users across workshops. */}
              {!scopedToWorkshop && <th className="px-4 py-3">Panel beater</th>}
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3" title="Signing in also needs a 6-digit code emailed to them.">
                2-step
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-semibold">
                  {u.name}
                  {u.mustChangePassword && (
                    <span
                      title="Still on a temporary password — they must change it at next sign-in."
                      className="ml-2 whitespace-nowrap rounded-full bg-amber/25 px-2 py-0.5 text-[11px] font-semibold text-ink/70"
                    >
                      temp password
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink/70">{u.email}</td>
                {!scopedToWorkshop && (
                  <td className="px-4 py-3">
                    {u.panelBeaterId ? (
                      <span className="text-ink">{workshopName(u.panelBeaterId)}</span>
                    ) : (
                      <span className="text-ink/35">— Price my Prang —</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <select
                    value={roles.some((r) => r.id === u.role) ? u.role : ""}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm"
                  >
                    {!roles.some((r) => r.id === u.role) && (
                      <option value="">{roleName(u.role)} (removed)</option>
                    )}
                    {scopedToWorkshop ? (
                      roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <optgroup label="Price my Prang staff">
                          {roles
                            .filter((r) => r.scope !== "panel_beater")
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Panel beater team">
                          {roles
                            .filter((r) => r.scope === "panel_beater")
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </optgroup>
                      </>
                    )}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={!!u.twoFactorEnabled}
                    title={
                      u.twoFactorEnabled
                        ? `${u.name} needs an emailed code to sign in.`
                        : `${u.name} signs in with a password only.`
                    }
                    onChange={(e) => setTwoFactor(u, e.target.checked)}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => resetPw(u.id)} className="text-teal hover:underline">
                      Reset password
                    </button>
                    <button
                      onClick={() => remove(u)}
                      className="font-semibold text-coral hover:underline"
                    >
                      Delete
                    </button>
                  </div>
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
