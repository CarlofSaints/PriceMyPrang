"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgreementDocument } from "@/lib/types";
import { shortDate } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

/**
 * Upload, replace and remove the repairer agreement. Uploading makes the new
 * document active immediately, so the next registration is sent the new terms.
 */
export default function AgreementManager({ initial }: { initial: AgreementDocument[] }) {
  const router = useRouter();
  const [docs, setDocs] = useState<AgreementDocument[]>(initial);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = docs.find((d) => d.active) ?? null;

  async function refresh() {
    const res = await fetch("/api/agreement");
    if (res.ok) setDocs(await res.json());
    router.refresh();
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a .docx file first.");

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (title.trim()) body.append("title", title.trim());

      const res = await fetch("/api/agreement", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        return;
      }
      setTitle("");
      setFile(null);
      setNotice("Uploaded. New registrations will be sent this version to sign.");
      await refresh();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: AgreementDocument) {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/agreement?id=${encodeURIComponent(doc.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed.");
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}

      <form onSubmit={upload} className="pmp-card space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          {active ? "Replace the agreement" : "Upload the agreement"}
        </h2>
        <p className="text-sm text-ink/60">
          Word (.docx) only. The text is converted for the signing page, and the original file is
          kept as the source of truth. Uploading a new one stands the current version down —
          signatures already given stay attached to the version that was signed.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="Shown at the top of the signing page.">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Repairer Agreement"
            />
          </Field>
          <Field label="Document" required>
            <input
              className={inputClass}
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? "Uploading…" : active ? "Upload new version" : "Upload"}
        </Button>
      </form>

      {docs.length === 0 ? (
        <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
          No agreement uploaded yet. Until one is, new repairers are NOT asked to sign anything —
          registration still works, it just skips the agreement email.
        </p>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="pmp-card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">
                  {d.title}
                  {d.active && (
                    <span className="ml-2 rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold text-teal">
                      Current
                    </span>
                  )}
                </h3>
                <p className="text-xs text-ink/50">
                  Uploaded {shortDate(d.createdAt)}
                  {d.uploadedByName ? ` by ${d.uploadedByName}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={d.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-teal hover:underline"
                >
                  Download original
                </a>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="text-xs font-semibold text-coral hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
