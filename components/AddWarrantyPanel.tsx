"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { MANUFACTURERS } from "@/lib/manufacturers";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import type { MediaRef } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

/**
 * "Add a warranty" for a panel beater who has already registered — the same
 * fields as the warranty section of the sign-up form, on its own.
 */
export default function AddWarrantyPanel({
  panelBeaterId,
  taken,
}: {
  /** Only needed when a manager is adding on a workshop's behalf. */
  panelBeaterId?: string;
  /** Manufacturers already captured, so we don't offer them twice. */
  taken: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manufacturer, setManufacturer] = useState("");
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [remind, setRemind] = useState(false);
  const [certificate, setCertificate] = useState<MediaRef | undefined>();

  const available = MANUFACTURERS.filter((m) => !taken.includes(m));

  function reset() {
    setManufacturer("");
    setQuery("");
    setStartDate("");
    setExpiryDate("");
    setRemind(false);
    setCertificate(undefined);
    setError(null);
  }

  async function uploadCertificate(file: File) {
    setError(null);
    try {
      const blob = await upload(
        `panel-beaters/certificates/${Date.now()}-${safeFileName(file.name)}`,
        file,
        { access: "private", handleUploadUrl: "/api/media/upload", contentType: file.type }
      );
      setCertificate({
        url: mediaPath(blob.pathname),
        pathname: blob.pathname,
        contentType: file.type,
      });
    } catch {
      setError("Certificate upload failed.");
    }
  }

  async function save() {
    if (!manufacturer) return setError("Choose a manufacturer.");
    if (!certificate) return setError(`Upload a certificate for the ${manufacturer} warranty.`);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/panel-beaters/warranties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelBeaterId,
          warranty: {
            manufacturer,
            startDate: startDate || undefined,
            expiryDate: expiryDate || undefined,
            certificate,
            remind,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't save that warranty.");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save that warranty. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Add a warranty</Button>
    );
  }

  return (
    <div className="pmp-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Add a warranty</h2>
          <p className="text-sm text-ink/60">
            Capture a manufacturer you&apos;re an approved warranty supplier for.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-ink/40 hover:text-ink"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      <Field label="Manufacturer" required>
        {manufacturer ? (
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-ink">{manufacturer}</span>
            <button
              type="button"
              onClick={() => setManufacturer("")}
              className="text-xs font-semibold text-coral hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Search manufacturers…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onBlur={() => setTimeout(() => setListOpen(false), 150)}
            />
            {listOpen && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-teal/20 bg-white shadow-lg">
                {(() => {
                  const q = query.trim().toLowerCase();
                  const matches = available.filter((m) => m.toLowerCase().includes(q));
                  if (matches.length === 0)
                    return <div className="px-4 py-3 text-sm text-ink/50">No matches</div>;
                  return matches.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setManufacturer(m);
                        setQuery("");
                        setListOpen(false);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-teal/10"
                    >
                      {m}
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date">
          <input
            className={inputClass}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Expiry date">
          <input
            className={inputClass}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Certificate" required>
        <input
          className={inputClass}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => e.target.files?.[0] && uploadCertificate(e.target.files[0])}
        />
        {certificate ? (
          <a
            href={certificate.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-teal underline"
          >
            ✓ Certificate uploaded — view
          </a>
        ) : (
          <p className="mt-1 text-xs text-coral">Certificate required.</p>
        )}
      </Field>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#00848d]"
        />
        <span>
          Remind me to update this certificate
          <span className="block text-xs text-ink/50">
            We&apos;ll email reminders at 3 months, 2 months, 1 month, 2 weeks and the day before
            it expires.
          </span>
        </span>
      </label>

      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save warranty"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
