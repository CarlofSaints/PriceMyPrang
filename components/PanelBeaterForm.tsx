"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { PanelBeater, WarrantyApproval } from "@/lib/types";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import { MANUFACTURERS } from "@/lib/manufacturers";
import { Button, Field, inputClass } from "./ui";

function friendlyGeoError(status: string, error?: string): string {
  switch (status) {
    case "NO_KEY":
      return "Geocoding isn't configured on the server (GEOCODING_API_KEY is missing).";
    case "NO_ADDRESS":
      return "Enter the physical address first.";
    case "ZERO_RESULTS":
      return "Google couldn't find that address — check the spelling / add a suburb & city.";
    case "REQUEST_DENIED":
      return `Google rejected the request: ${error || "the key is restricted or the Geocoding API isn't enabled on it."}`;
    case "OVER_QUERY_LIMIT":
      return "Google quota/billing issue on the Maps project.";
    default:
      return `Couldn't get coordinates (${status}${error ? `: ${error}` : ""}).`;
  }
}

export default function PanelBeaterForm({
  existing,
  mode = "admin",
  submitUrl = "/api/panel-beaters",
  onSuccess,
}: {
  existing?: PanelBeater;
  mode?: "admin" | "public";
  submitUrl?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Partial<PanelBeater>>(existing ?? { active: true });
  const [logoUrl, setLogoUrl] = useState<string | undefined>(existing?.logoUrl);
  const [warranties, setWarranties] = useState<WarrantyApproval[]>(existing?.warranties ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [mfQuery, setMfQuery] = useState("");
  const [mfOpen, setMfOpen] = useState(false);

  function set<K extends keyof PanelBeater>(key: K, value: PanelBeater[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function getCoordinates() {
    if (!form.physicalAddress?.trim()) {
      setGeoMsg({ ok: false, text: "Enter the physical address first." });
      return;
    }
    setGeoBusy(true);
    setGeoMsg(null);
    try {
      const res = await fetch("/api/panel-beaters/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: form.physicalAddress }),
      });
      const data = await res.json();
      if (data.ok) {
        setForm((f) => ({ ...f, lat: data.lat, lng: data.lng }));
        setGeoMsg({ ok: true, text: `📍 Located at ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` });
      } else {
        setGeoMsg({ ok: false, text: friendlyGeoError(data.status, data.error) });
      }
    } catch {
      setGeoMsg({ ok: false, text: "Couldn't reach the geocoder. Try again." });
    } finally {
      setGeoBusy(false);
    }
  }

  // ---- Warranty approvals ----
  const availableManufacturers = MANUFACTURERS.filter(
    (m) => !warranties.some((w) => w.manufacturer === m)
  );

  function addManufacturer(m: string) {
    if (!m || warranties.some((w) => w.manufacturer === m)) return;
    setWarranties((ws) => [...ws, { manufacturer: m, remind: false }]);
  }
  function updateWarranty(i: number, patch: Partial<WarrantyApproval>) {
    setWarranties((ws) => ws.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  function removeWarranty(i: number) {
    setWarranties((ws) => ws.filter((_, idx) => idx !== i));
  }
  async function uploadCertificate(i: number, file: File) {
    try {
      const blob = await upload(
        `panel-beaters/certificates/${Date.now()}-${safeFileName(file.name)}`,
        file,
        { access: "private", handleUploadUrl: "/api/media/upload", contentType: file.type }
      );
      updateWarranty(i, {
        certificate: { url: mediaPath(blob.pathname), pathname: blob.pathname, contentType: file.type },
      });
    } catch {
      setError("Certificate upload failed.");
    }
  }

  async function uploadLogo(file: File) {
    try {
      const blob = await upload(
        `panel-beaters/logos/${Date.now()}-${safeFileName(file.name)}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/media/upload",
          contentType: file.type,
        }
      );
      setLogoUrl(mediaPath(blob.pathname));
    } catch {
      setError("Logo upload failed.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logoUrl, warranties }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      if (onSuccess) {
        onSuccess();
        return;
      }
      router.push("/portal/panel-beaters");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Contact people</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name of person completing this form">
            <input className={inputClass} value={form.completedByName ?? ""} onChange={(e) => set("completedByName", e.target.value)} />
          </Field>
          <Field label="Email of person completing this form">
            <input className={inputClass} type="email" value={form.completedByEmail ?? ""} onChange={(e) => set("completedByEmail", e.target.value)} />
          </Field>
          <Field label="Name of business owner">
            <input className={inputClass} value={form.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
          </Field>
          <Field label="Email of business owner">
            <input className={inputClass} type="email" value={form.ownerEmail ?? ""} onChange={(e) => set("ownerEmail", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" required>
          <input className={inputClass} value={form.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} required />
        </Field>
        <Field label="Trading as">
          <input className={inputClass} value={form.tradingAs ?? ""} onChange={(e) => set("tradingAs", e.target.value)} />
        </Field>
        <Field label="Company reg number" required>
          <input className={inputClass} value={form.companyRegNumber ?? ""} onChange={(e) => set("companyRegNumber", e.target.value)} required />
        </Field>
        <Field label="VAT number">
          <input className={inputClass} value={form.vatNumber ?? ""} onChange={(e) => set("vatNumber", e.target.value)} />
        </Field>
      </div>

      <Field label="Physical address" hint="Used to map your workshop for consumers." required>
        <input
          className={inputClass}
          value={form.physicalAddress ?? ""}
          onChange={(e) => {
            set("physicalAddress", e.target.value);
            setGeoMsg(null);
          }}
          required
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="md" onClick={getCoordinates} disabled={geoBusy}>
            {geoBusy ? "Locating…" : "📍 Get coordinates"}
          </Button>
          {form.lat != null && form.lng != null && (
            <span className="text-xs text-ink/60">
              {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
            </span>
          )}
        </div>
        {geoMsg && (
          <p className={`mt-2 text-sm ${geoMsg.ok ? "text-teal" : "text-coral"}`}>{geoMsg.text}</p>
        )}
        {form.lat == null && (
          <p className="mt-1 text-xs text-ink/50">
            Tip: click “Get coordinates” to place this workshop on the consumer map.
          </p>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MIBCO number" required>
          <input className={inputClass} value={form.mibcoNumber ?? ""} onChange={(e) => set("mibcoNumber", e.target.value)} required />
        </Field>
        <Field label="RMI number" required>
          <input className={inputClass} value={form.rmiNumber ?? ""} onChange={(e) => set("rmiNumber", e.target.value)} required />
        </Field>
        <Field label="SAMBRA number" required>
          <input className={inputClass} value={form.sambraNumber ?? ""} onChange={(e) => set("sambraNumber", e.target.value)} required />
        </Field>
        <Field label="MIWA number">
          <input className={inputClass} value={form.miwaNumber ?? ""} onChange={(e) => set("miwaNumber", e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Labour rate — senior (R/hr)">
          <input className={inputClass} type="number" step="0.01" value={form.labourRateSenior ?? ""} onChange={(e) => set("labourRateSenior", Number(e.target.value))} />
        </Field>
        <Field label="Labour rate — junior (R/hr)">
          <input className={inputClass} type="number" step="0.01" value={form.labourRateJunior ?? ""} onChange={(e) => set("labourRateJunior", Number(e.target.value))} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact email">
          <input className={inputClass} type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className={inputClass} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <Field label="Workshop logo" hint="Appears on quotes you're selected for.">
        <input className={inputClass} type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="mt-2 h-14 w-auto rounded" />
        )}
      </Field>

      {/* Warranty approvals */}
      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="font-display text-base font-semibold text-ink">
          Manufacturer warranty approvals
        </h3>
        <p className="mb-3 text-sm text-ink/60">
          Tick the manufacturers for which you are an approved warranty supplier, then add each
          certificate&apos;s dates and file.
        </p>

        <Field label="Add a manufacturer you're approved for">
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Search manufacturers…"
              value={mfQuery}
              onChange={(e) => {
                setMfQuery(e.target.value);
                setMfOpen(true);
              }}
              onFocus={() => setMfOpen(true)}
              onBlur={() => setTimeout(() => setMfOpen(false), 150)}
            />
            {mfOpen && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-teal/20 bg-white shadow-lg">
                {(() => {
                  const q = mfQuery.trim().toLowerCase();
                  const matches = availableManufacturers.filter((m) =>
                    m.toLowerCase().includes(q)
                  );
                  if (matches.length === 0)
                    return <div className="px-4 py-3 text-sm text-ink/50">No matches</div>;
                  return matches.map((m) => (
                    <button
                      type="button"
                      key={m}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addManufacturer(m);
                        setMfQuery("");
                        setMfOpen(false);
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
        </Field>

        {warranties.length > 0 && (
          <div className="mt-4 space-y-4">
            {warranties.map((w, i) => (
              <div key={w.manufacturer} className="rounded-xl border border-teal/20 bg-offwhite/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-display font-semibold text-ink">{w.manufacturer}</span>
                  <button
                    type="button"
                    onClick={() => removeWarranty(i)}
                    className="text-xs font-semibold text-coral hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start date">
                    <input
                      className={inputClass}
                      type="date"
                      value={w.startDate ?? ""}
                      onChange={(e) => updateWarranty(i, { startDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Expiry date">
                    <input
                      className={inputClass}
                      type="date"
                      value={w.expiryDate ?? ""}
                      onChange={(e) => updateWarranty(i, { expiryDate: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Certificate">
                  <input
                    className={inputClass}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => e.target.files?.[0] && uploadCertificate(i, e.target.files[0])}
                  />
                  {w.certificate && (
                    <a href={w.certificate.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-teal underline">
                      ✓ Certificate uploaded — view
                    </a>
                  )}
                </Field>
                <label className="mt-1 flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={w.remind ?? false}
                    onChange={(e) => updateWarranty(i, { remind: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-[#00848d]"
                  />
                  <span>
                    Remind me to update this certificate
                    <span className="block text-xs text-ink/50">
                      We&apos;ll email reminders at 3 months, 2 months, 1 month, 2 weeks and the day
                      before it expires.
                    </span>
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {mode === "admin" && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" checked={form.active ?? true} onChange={(e) => set("active", e.target.checked)} />
          Active (visible to consumers on the map)
        </label>
      )}

      {mode === "public" && (
        <p className="rounded-xl bg-teal/5 p-3 text-sm text-ink/70">
          Your application will be reviewed by our team. Only MIWA, MIBCO and RMI approved panel
          beaters are listed on <strong className="font-semibold text-ink">Price my Prang</strong> —
          we&apos;ll verify your details and be in touch.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy
            ? "Submitting…"
            : mode === "public"
            ? "Submit application"
            : existing
            ? "Save changes"
            : "Add panel beater"}
        </Button>
      </div>
    </form>
  );
}
