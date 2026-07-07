"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { MediaRef, PanelBeater, VehicleDetails, YesNo, YesNoUnsure } from "@/lib/types";
import { Button, Field, inputClass } from "./ui";
import PanelBeaterMap from "./PanelBeaterMap";

const MAX_PHOTOS = 15;
const MAX_VIDEO_SECONDS = 20;

type Step = "form" | "map" | "done";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  hasInsurance: YesNo | "";
  underWarranty: YesNoUnsure | "";
  isInsuranceClaim: YesNo | "";
  isThirdPartyClaim: YesNo | "";
  suspectedEngineDamage: YesNo | "";
  quotesRequested: number;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  hasInsurance: "",
  underWarranty: "",
  isInsuranceClaim: "",
  isThirdPartyClaim: "",
  suspectedEngineDamage: "",
  quotesRequested: 1,
};

async function uploadFile(file: File | Blob, prefix: string): Promise<MediaRef> {
  const name =
    file instanceof File ? file.name : `${prefix}-${Date.now()}.webm`;
  const blob = await upload(`requests/tmp/${prefix}/${Date.now()}-${name}`, file, {
    access: "public",
    handleUploadUrl: "/api/media/upload",
    contentType: (file as File).type || "application/octet-stream",
  });
  return { url: blob.url, pathname: blob.pathname, contentType: (file as File).type };
}

export default function QuoteFlow({ onClose }: { onClose?: () => void }) {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Media
  const [disc, setDisc] = useState<MediaRef | null>(null);
  const [discReading, setDiscReading] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleDetails>({});
  const [video, setVideo] = useState<MediaRef | null>(null);
  const [photos, setPhotos] = useState<MediaRef[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Map
  const [panelBeaters, setPanelBeaters] = useState<PanelBeater[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reference, setReference] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleDisc(file: File) {
    setError(null);
    setDiscReading(true);
    try {
      const ref = await uploadFile(file, "disc");
      setDisc(ref);
      // OCR the licence disc via Claude.
      const res = await fetch("/api/disc/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ref.url }),
      });
      if (res.ok) {
        const data = (await res.json()) as VehicleDetails;
        setVehicle(data);
      }
    } catch {
      setError("Could not upload the licence disc photo. Please try again.");
    } finally {
      setDiscReading(false);
    }
  }

  async function handlePhotos(files: FileList) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length === 0) return;
    setUploadingPhotos(true);
    try {
      const uploaded = await Promise.all(chosen.map((f) => uploadFile(f, "damage")));
      setPhotos((p) => [...p, ...uploaded]);
    } catch {
      setError("One or more photos failed to upload. Please try again.");
    } finally {
      setUploadingPhotos(false);
    }
  }

  function validateForm(): string | null {
    if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your name and surname.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return "Please enter a valid email address.";
    for (const [k, label] of [
      ["hasInsurance", "if you have insurance"],
      ["underWarranty", "if your vehicle is under warranty"],
      ["isInsuranceClaim", "if this is an insurance claim"],
      ["isThirdPartyClaim", "if this is a 3rd party claim"],
      ["suspectedEngineDamage", "if you suspect engine damage"],
    ] as const) {
      if (!form[k]) return `Please answer: ${label}.`;
    }
    if (!disc) return "Please add a photo of your licence disc.";
    if (photos.length === 0) return "Please add at least one photo of the damage.";
    return null;
  }

  async function goToMap() {
    const v = validateForm();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/panel-beaters/public");
      const data = (await res.json()) as PanelBeater[];
      setPanelBeaters(data);
    } catch {
      setPanelBeaters([]);
    }
    // Ask for location.
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () =>
          setLocError(
            "We couldn't access your location. You can still choose a workshop from the list below."
          ),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocError("Location isn't available on this device — pick a workshop from the list.");
    }
    setBusy(false);
    setStep("map");
  }

  async function submit() {
    if (selectedIds.length === 0) {
      setError("Please select at least one panel beater.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vehicle,
          discImage: disc,
          video,
          damagePhotos: photos,
          location,
          selectedPanelBeaterIds: selectedIds,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reference: string };
      setReference(data.reference);
      setStep("done");
    } catch {
      setError("Something went wrong submitting your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {step === "form" && (
        <div className="space-y-5">
          <Header
            title="Price my Prang"
            subtitle="Tell us what happened and we'll line up your quotes."
            onClose={onClose}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <input
                className={inputClass}
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                autoComplete="given-name"
              />
            </Field>
            <Field label="Surname" required>
              <input
                className={inputClass}
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                autoComplete="family-name"
              />
            </Field>
          </div>

          <Field label="Email address" required>
            <input
              className={inputClass}
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
            />
          </Field>

          <YesNoField
            label="Do you have insurance?"
            value={form.hasInsurance}
            onChange={(v) => set("hasInsurance", v as YesNo)}
          />
          <YesNoField
            label="Is your vehicle still under warranty?"
            value={form.underWarranty}
            onChange={(v) => set("underWarranty", v as YesNoUnsure)}
            options={["yes", "no", "unsure"]}
          />
          <YesNoField
            label="Is this for an insurance claim?"
            value={form.isInsuranceClaim}
            onChange={(v) => set("isInsuranceClaim", v as YesNo)}
          />
          <YesNoField
            label="Is this a 3rd party claim?"
            value={form.isThirdPartyClaim}
            onChange={(v) => set("isThirdPartyClaim", v as YesNo)}
          />

          <Field
            label="Photo of your licence disc"
            hint="We read this to identify your vehicle (make, model, VIN)."
            required
          >
            <input
              className={inputClass}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => e.target.files?.[0] && handleDisc(e.target.files[0])}
            />
            {discReading && <p className="mt-2 text-sm text-teal">Reading your disc…</p>}
            {disc && !discReading && (
              <p className="mt-2 text-sm text-teal">
                ✓ Disc uploaded
                {vehicle.make || vehicle.model
                  ? ` — ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}`
                  : ""}
              </p>
            )}
          </Field>

          <Field
            label="Optional: 20-second video of the damage"
            hint="Slowly pan around the vehicle. Recording stops automatically at 20 seconds."
          >
            <VideoCapture
              onRecorded={async (blob) => {
                try {
                  const ref = await uploadFile(blob, "video");
                  setVideo(ref);
                } catch {
                  setError("Video upload failed. You can skip it and continue.");
                }
              }}
              uploaded={!!video}
              onClear={() => setVideo(null)}
            />
          </Field>

          <YesNoField
            label="Do you suspect any engine damage?"
            value={form.suspectedEngineDamage}
            onChange={(v) => set("suspectedEngineDamage", v as YesNo)}
          />

          <Field
            label="Photos of the damage"
            hint={`Add as many angles as you can — close-ups and wider shots. Up to ${MAX_PHOTOS}.`}
            required
          >
            <input
              className={inputClass}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={photos.length >= MAX_PHOTOS}
              onChange={(e) => e.target.files && handlePhotos(e.target.files)}
            />
            {uploadingPhotos && <p className="mt-2 text-sm text-teal">Uploading photos…</p>}
            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <div key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={`Damage ${i + 1}`}
                      className="h-16 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((ps) => ps.filter((x) => x.url !== p.url))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs text-white"
                      aria-label="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-ink/50">{photos.length}/{MAX_PHOTOS} added</p>
          </Field>

          <Field label="How many quotes would you like?" required>
            <select
              className={inputClass}
              value={form.quotesRequested}
              onChange={(e) => set("quotesRequested", Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} quote{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </Field>

          {error && <ErrorBox message={error} />}

          <Button size="lg" className="w-full" onClick={goToMap} disabled={busy}>
            {busy ? "Please wait…" : "Next — choose your workshop"}
          </Button>
        </div>
      )}

      {step === "map" && (
        <div className="space-y-5">
          <Header
            title="Choose your panel beater"
            subtitle={`Select ${form.quotesRequested} workshop${
              form.quotesRequested > 1 ? "s" : ""
            } near you.`}
            onClose={onClose}
          />
          {locError && <p className="rounded-xl bg-amber/20 p-3 text-sm text-ink">{locError}</p>}

          <PanelBeaterMap
            panelBeaters={panelBeaters}
            userLocation={location}
            quotesRequested={form.quotesRequested}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />

          {error && <ErrorBox message={error} />}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("form")}>
              Back
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy || selectedIds.length === 0}>
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 text-3xl">
            🎉
          </div>
          <h2 className="font-display text-2xl font-bold text-ink">Thank you for your submission</h2>
          <p className="text-ink/70">
            The details of this quote request will be sent to the provider{form.quotesRequested > 1 ? "s" : ""} of
            your choice. We&apos;ll be in contact with your quote within the next 24 hours.
          </p>
          <div className="rounded-xl bg-ink px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-wide text-teal-light">Your reference number</p>
            <p className="font-display text-xl font-bold">{reference}</p>
          </div>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

function Header({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
        <p className="text-sm text-ink/60">{subtitle}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="text-ink/40 hover:text-ink" aria-label="Close">
          ✕
        </button>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{message}</p>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  options = ["yes", "no"],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return (
    <Field label={label} required>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition-colors ${
              value === opt
                ? "border-teal bg-teal text-white"
                : "border-teal/20 bg-white text-ink hover:bg-teal/5"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </Field>
  );
}

function VideoCapture({
  onRecorded,
  uploaded,
  onClear,
}: {
  onRecorded: (blob: Blob) => void;
  uploaded: boolean;
  onClear: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
    }
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        onRecorded(blob);
        stopStream();
      };
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_VIDEO_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setSupported(false);
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  if (!supported) {
    return (
      <p className="rounded-xl bg-ink/5 p-3 text-sm text-ink/60">
        In-browser recording isn&apos;t supported on this device — no problem, the photos are enough.
      </p>
    );
  }

  if (uploaded && previewUrl) {
    return (
      <div className="space-y-2">
        <video src={previewUrl} controls className="w-full rounded-xl" />
        <Button variant="outline" size="md" onClick={onClear}>
          Re-record
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        muted
        playsInline
        className={`w-full rounded-xl bg-ink/90 ${recording ? "" : "hidden"}`}
      />
      {recording ? (
        <div className="flex items-center gap-3">
          <Button variant="coral" onClick={stop} type="button">
            ⏹ Stop ({MAX_VIDEO_SECONDS - seconds}s)
          </Button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full bg-coral transition-all"
              style={{ width: `${(seconds / MAX_VIDEO_SECONDS) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={start} type="button">
          ● Record 20s clip
        </Button>
      )}
    </div>
  );
}
