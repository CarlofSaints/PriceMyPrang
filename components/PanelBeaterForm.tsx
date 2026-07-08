"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { PanelBeater } from "@/lib/types";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
        body: JSON.stringify({ ...form, logoUrl }),
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
