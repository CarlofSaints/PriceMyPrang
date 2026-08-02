"use client";

import { useState } from "react";
import { shortDate } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

export type IntegrationMeta = {
  masked: string;
  /** The non-secret half — shown in full, it identifies the account. */
  clientId?: string;
  updatedByName?: string;
  updatedAt: string;
  /** False when the stored value can no longer be decrypted. */
  readable: boolean;
};

export default function IntegrationKeys({ initial }: { initial: IntegrationMeta | null }) {
  const [meta, setMeta] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Entering a new key
  const [editing, setEditing] = useState(!initial);
  const [key, setKey] = useState("");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [savePassword, setSavePassword] = useState("");

  // Revealing the stored one
  const [revealing, setRevealing] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  function reset() {
    setKey("");
    setSavePassword("");
    setRevealPassword("");
    setError(null);
  }

  async function save() {
    if (!key.trim()) return setError("Paste the API key.");
    if (!savePassword) return setError("Enter your own password to confirm the change.");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: "imagin8",
          key,
          clientId,
          password: savePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the key");

      setMeta({
        masked: data.masked,
        clientId: data.clientId,
        updatedAt: new Date().toISOString(),
        readable: true,
      });
      setEditing(false);
      setRevealed(null);
      reset();
      setNotice("Key saved and encrypted.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!revealPassword) return setError("Enter your password to reveal the key.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", id: "imagin8", password: revealPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reveal the key");
      setRevealed(data.key);
      setRevealing(false);
      setRevealPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pmp-card max-w-2xl space-y-5 p-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">imagin8 — VIN lookup</h2>
        <p className="mt-1 text-sm text-ink/60">
          Decodes a VIN read off the licence disc into make, model, year, M&amp;M code and
          values. Billed per lookup, so every result is cached and never fetched twice.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal">
          {notice}
        </div>
      )}

      {meta && !meta.readable && (
        <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">This key can no longer be read.</strong> That happens
          when <code>SESSION_SECRET</code> is rotated. Enter the key again to fix it.
        </div>
      )}

      {meta && !editing && (
        <div className="space-y-3">
          <div className="space-y-3 rounded-xl bg-ink/[0.04] px-4 py-3">
            {meta.clientId && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                  Client ID
                </p>
                <p className="font-mono text-sm text-ink">{meta.clientId}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">API key</p>
              <p className="font-mono text-sm text-ink">{revealed ?? meta.masked}</p>
            </div>
            <p className="text-xs text-ink/50">
              {meta.updatedByName ? `Set by ${meta.updatedByName}` : "Set"} on{" "}
              {shortDate(meta.updatedAt)}
            </p>
          </div>

          {revealed && (
            <button
              type="button"
              className="text-sm text-teal underline"
              onClick={() => setRevealed(null)}
            >
              Hide again
            </button>
          )}

          {revealing ? (
            <div className="space-y-3">
              <Field label="Your password" hint="Confirms it's you before the key is shown.">
                <input
                  type="password"
                  className={inputClass}
                  value={revealPassword}
                  onChange={(e) => setRevealPassword(e.target.value)}
                  name="confirm-reveal"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  autoFocus
                />
              </Field>
              <div className="flex gap-2">
                <Button type="button" disabled={busy} onClick={reveal}>
                  {busy ? "Checking…" : "Reveal key"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRevealing(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!revealed && (
                <Button type="button" variant="outline" onClick={() => setRevealing(true)}>
                  Reveal key
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                Replace key
              </Button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-4">
          {/* Chrome reads "text field followed by password field" as a login
              form and fills the first one with the saved username — which put
              an email address in the API key box. The decoys below absorb that,
              and the real inputs opt out by name as well as by attribute. */}
          <input type="text" name="username" autoComplete="username" className="hidden" readOnly />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="hidden"
            readOnly
          />

          <Field
            label="Client ID"
            hint="Issued by imagin8 alongside the key. Not a secret — shown in full so you can confirm which account is wired up."
          >
            <input
              className={`${inputClass} font-mono`}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID from the imagin8 email"
              name="imagin8-client-id"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
            />
          </Field>

          <Field label={meta ? "New API key" : "API key"} required>
            <input
              className={`${inputClass} font-mono`}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste the key from your imagin8 portal"
              name="imagin8-key"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
            />
          </Field>

          <Field label="Your password" required hint="Confirms it's you before the key changes.">
            <input
              type="password"
              className={inputClass}
              value={savePassword}
              onChange={(e) => setSavePassword(e.target.value)}
              name="confirm-identity"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
            />
          </Field>

          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save key"}
            </Button>
            {meta && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  reset();
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="border-t border-ink/10 pt-4 text-xs text-ink/45">
        The key is encrypted before it is stored, so it is unreadable to anything querying the
        database directly — including Power BI.
      </p>
    </div>
  );
}
