"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type {
  MediaRef,
  PanelBeater,
  PhotoSide,
  RequiredPhotos,
  VehicleDetails,
  YesNo,
  YesNoUnsure,
} from "@/lib/types";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import { Button, Field, inputClass } from "./ui";
import PanelBeaterMap from "./PanelBeaterMap";

const MAX_PHOTOS = 15;
const MAX_VIDEO_SECONDS = 20;

type Step = "form" | "map" | "done";

// The four full-vehicle photos, in the order we show them.
const REQUIRED_SIDES: { key: PhotoSide; label: string; hint: string }[] = [
  { key: "front", label: "Front", hint: "Whole front of the car, straight on." },
  { key: "back", label: "Back", hint: "Whole rear of the car, straight on." },
  { key: "left", label: "Left side", hint: "Full driver's side, front to back." },
  { key: "right", label: "Right side", hint: "Full passenger's side, front to back." },
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  hasInsurance: YesNo | "";
  insurerName: string;
  underWarranty: YesNoUnsure | "";
  isInsuranceClaim: YesNo | "";
  claimNumber: string;
  noClaimNumberYet: boolean;
  isThirdPartyClaim: YesNo | "";
  suspectedEngineDamage: YesNo | "";
  quotesRequested: number;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  companyName: "",
  hasInsurance: "",
  insurerName: "",
  underWarranty: "",
  isInsuranceClaim: "",
  claimNumber: "",
  noClaimNumberYet: false,
  isThirdPartyClaim: "",
  suspectedEngineDamage: "",
  quotesRequested: 1,
};

async function uploadFile(file: File | Blob, prefix: string): Promise<MediaRef> {
  const name = safeFileName(
    file instanceof File ? file.name : `${prefix}-${Date.now()}.webm`
  );
  const blob = await upload(`requests/tmp/${prefix}/${Date.now()}-${name}`, file, {
    access: "private",
    handleUploadUrl: "/api/media/upload",
    contentType: (file as File).type || "application/octet-stream",
  });
  return {
    url: mediaPath(blob.pathname),
    pathname: blob.pathname,
    contentType: (file as File).type,
  };
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
  const [requiredPhotos, setRequiredPhotos] = useState<RequiredPhotos>({});
  const [uploadingSide, setUploadingSide] = useState<PhotoSide | null>(null);
  const [photos, setPhotos] = useState<MediaRef[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ pathname: ref.pathname }),
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

  async function handleSidePhoto(side: PhotoSide, file: File) {
    setError(null);
    setUploadingSide(side);
    try {
      const ref = await uploadFile(file, `side-${side}`);
      setRequiredPhotos((prev) => ({ ...prev, [side]: ref }));
    } catch {
      setError(`Could not upload the ${side} photo. Please try again.`);
    } finally {
      setUploadingSide(null);
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
    if (form.phone.replace(/\D/g, "").length < 9) return "Please enter a valid contact number.";
    for (const [k, label] of [
      ["hasInsurance", "if you have insurance"],
      ["underWarranty", "if your vehicle is under warranty"],
      ["isInsuranceClaim", "if this is an insurance claim"],
      ["isThirdPartyClaim", "if you're claiming from someone else (3rd party)"],
      ["suspectedEngineDamage", "if you suspect engine damage"],
    ] as const) {
      if (!form[k]) return `Please answer: ${label}.`;
    }
    if (form.hasInsurance === "yes" && !form.insurerName.trim())
      return "Please enter the name of your insurance company.";
    if (form.isInsuranceClaim === "yes" && !form.claimNumber.trim() && !form.noClaimNumberYet)
      return "Please enter your claim number, or tick that you don't have one yet.";
    if (!disc) return "Please add a photo of your licence disc.";
    const missingSide = REQUIRED_SIDES.find((s) => !requiredPhotos[s.key]);
    if (missingSide) return `Please add the ${missingSide.label.toLowerCase()} photo of the vehicle.`;
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

  async function submit(chooseForMe = false) {
    if (!chooseForMe && selectedIds.length !== form.quotesRequested) {
      setError(
        `Please select ${form.quotesRequested} different workshop${
          form.quotesRequested > 1 ? "s" : ""
        }, or choose "You choose for me".`
      );
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
          requiredPhotos,
          damagePhotos: photos,
          location,
          letUsChoose: chooseForMe,
          selectedPanelBeaterIds: chooseForMe ? [] : selectedIds,
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Field label="Contact number" required>
              <input
                className={inputClass}
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                autoComplete="tel"
                placeholder="e.g. 082 123 4567"
              />
            </Field>
          </div>

          <Field
            label="Company name"
            hint="Only if this vehicle belongs to a business (e.g. self- or partially-insured fleet). Leave blank if it's your personal car."
          >
            <input
              className={inputClass}
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              autoComplete="organization"
              placeholder="Optional"
            />
          </Field>

          <div>
            <YesNoField
              label="Do you have insurance?"
              hint="Only choose “Yes” if the policy is your own."
              value={form.hasInsurance}
              onChange={(v) => set("hasInsurance", v as YesNo)}
            />
            {form.hasInsurance === "yes" && (
              <div className="mt-3">
                <Field
                  label="Who is your insurance company?"
                  hint="We use this to make sure your quotes are at the right rates."
                  required
                >
                  <input
                    className={inputClass}
                    value={form.insurerName}
                    onChange={(e) => set("insurerName", e.target.value)}
                    placeholder="e.g. Santam, Discovery Insure, OUTsurance…"
                  />
                </Field>
              </div>
            )}
          </div>

          <YesNoField
            label="Is your vehicle still under warranty?"
            value={form.underWarranty}
            onChange={(v) => set("underWarranty", v as YesNoUnsure)}
            options={["yes", "no", "unsure"]}
          />

          <div>
            <YesNoField
              label="Is this for your insurance claim?"
              value={form.isInsuranceClaim}
              onChange={(v) => set("isInsuranceClaim", v as YesNo)}
            />
            {form.isInsuranceClaim === "yes" && (
              <div className="mt-3">
                <Field label="Claim number">
                  <input
                    className={inputClass}
                    value={form.claimNumber}
                    onChange={(e) => set("claimNumber", e.target.value)}
                    disabled={form.noClaimNumberYet}
                    placeholder={form.noClaimNumberYet ? "—" : "Your insurer's claim number"}
                  />
                </Field>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink/70">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal"
                    checked={form.noClaimNumberYet}
                    onChange={(e) => {
                      set("noClaimNumberYet", e.target.checked);
                      if (e.target.checked) set("claimNumber", "");
                    }}
                  />
                  I don&apos;t have a claim number yet
                </label>
              </div>
            )}
          </div>

          <YesNoField
            label="Are you claiming the damage costs from someone else (3rd party)?"
            hint="A “3rd party” is another person or their insurer — e.g. someone else drove into you and their insurance should pay. If the accident was your fault or you're claiming from your own insurer, choose “No”."
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

          {/* Four mandatory full-vehicle photos */}
          <div className="rounded-2xl border border-teal/20 bg-white p-4">
            <p className="text-sm font-semibold text-ink">
              4 full photos of your car <span className="text-coral">*</span>
            </p>
            <p className="mt-1 text-xs text-ink/60">
              Most insurers require one clear photo of each side of the vehicle. Stand back so the
              whole car fits in the frame, shoot in good light and keep the number plate visible.
            </p>
            <PhotoGuide />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REQUIRED_SIDES.map((s) => (
                <SidePhotoTile
                  key={s.key}
                  side={s}
                  photo={requiredPhotos[s.key] ?? null}
                  uploading={uploadingSide === s.key}
                  onPick={(file) => handleSidePhoto(s.key, file)}
                  onClear={() =>
                    setRequiredPhotos((prev) => {
                      const next = { ...prev };
                      delete next[s.key];
                      return next;
                    })
                  }
                />
              ))}
            </div>
          </div>

          <Field
            label="Additional close-up photos of the damage"
            hint={`Optional but helpful — get in close on the damaged areas. Tap ＋ each time to add another. Up to ${MAX_PHOTOS}.`}
          >
            {/* hidden input, triggered by the + tile so it's clear each tap ADDS */}
            <input
              ref={photoInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => {
                if (e.target.files) handlePhotos(e.target.files);
                e.target.value = ""; // reset so the same file can be re-picked & it's clearly additive
              }}
            />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <div key={p.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Damage ${i + 1}`}
                    className="h-20 w-full rounded-lg border border-teal/15 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((ps) => ps.filter((x) => x.url !== p.url))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs text-white shadow"
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-teal/40 text-teal transition-colors hover:bg-teal/5 disabled:opacity-50"
                >
                  <span className="text-2xl leading-none">＋</span>
                  <span className="text-xs font-semibold">
                    {uploadingPhotos ? "Uploading…" : photos.length === 0 ? "Add photos" : "Add more"}
                  </span>
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-ink/50">
              {photos.length}/{MAX_PHOTOS} added{photos.length > 0 ? " — tap ＋ to add another angle" : ""}
            </p>
          </Field>

          <QuotesCountField
            value={form.quotesRequested}
            onChange={(n) => set("quotesRequested", n)}
          />

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
            subtitle={`Pick ${form.quotesRequested} different workshop${
              form.quotesRequested > 1 ? "s" : ""
            } near you — one per quote — or let us choose for you.`}
            onClose={onClose}
          />
          {locError && <p className="rounded-xl bg-amber/20 p-3 text-sm text-ink">{locError}</p>}

          {/* Prefer us to pick? Skip selection entirely. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal/20 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Not sure who to pick?</p>
              <p className="text-xs text-ink/60">
                We&apos;ll choose {form.quotesRequested} suitable repairer
                {form.quotesRequested > 1 ? "s" : ""} near you.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => submit(true)}
              disabled={busy}
              className="shrink-0"
            >
              {busy ? "Please wait…" : "You choose for me"}
            </Button>
          </div>

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
            <Button
              className="flex-1"
              onClick={() => submit(false)}
              disabled={busy || selectedIds.length !== form.quotesRequested}
            >
              {busy
                ? "Submitting…"
                : `Submit request (${selectedIds.length}/${form.quotesRequested})`}
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

function QuotesCountField({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const presets = [1, 2, 3];
  const isCustom = !presets.includes(value);
  const tile =
    "h-12 min-w-12 rounded-xl border px-4 text-sm font-semibold transition-colors";
  const on = "border-teal bg-teal text-white";
  const off = "border-teal/20 bg-white text-ink hover:bg-teal/5";
  return (
    <Field
      label="How many quotes would you like?"
      hint="Each quote comes from a different repairer so you can compare. You'll pick that many workshops next (or let us choose)."
      required
    >
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`${tile} ${value === n ? on : off}`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(isCustom ? value : 4)}
          className={`${tile} ${isCustom ? on : off}`}
        >
          Other
        </button>
        {isCustom && (
          <input
            type="number"
            min={4}
            max={20}
            aria-label="Number of quotes"
            className={`${inputClass} w-24`}
            value={value}
            onChange={(e) =>
              onChange(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
            }
          />
        )}
      </div>
    </Field>
  );
}

/** Simple top-down car diagram showing the four required shots. */
function PhotoGuide() {
  const tag = "absolute rounded bg-teal px-1.5 py-0.5 text-[10px] font-bold text-white";
  return (
    <div className="mt-3 flex justify-center">
      <div className="relative h-28 w-44">
        <div className="absolute left-1/2 top-1/2 h-20 w-28 -translate-x-1/2 -translate-y-1/2 rounded-[26px] border-2 border-ink/40 bg-offwhite">
          <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-t-lg border-2 border-b-0 border-ink/20" />
          <div className="absolute bottom-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-b-lg border-2 border-t-0 border-ink/20" />
        </div>
        <span className={`${tag} left-1/2 top-0 -translate-x-1/2`}>FRONT</span>
        <span className={`${tag} bottom-0 left-1/2 -translate-x-1/2`}>BACK</span>
        <span className={`${tag} left-0 top-1/2 -translate-y-1/2`}>LEFT</span>
        <span className={`${tag} right-0 top-1/2 -translate-y-1/2`}>RIGHT</span>
      </div>
    </div>
  );
}

function SidePhotoTile({
  side,
  photo,
  uploading,
  onPick,
  onClear,
}: {
  side: { key: PhotoSide; label: string; hint: string };
  photo: MediaRef | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files?.[0]) onPick(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {photo ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={`${side.label} of vehicle`}
            className="h-24 w-full rounded-lg border border-teal/15 object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs text-white shadow"
            aria-label={`Remove ${side.label} photo`}
          >
            ✕
          </button>
          <span className="absolute bottom-1 left-1 rounded bg-teal/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
            ✓ {side.label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title={side.hint}
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-teal/40 px-1 text-center text-teal transition-colors hover:bg-teal/5 disabled:opacity-50"
        >
          <span className="text-xl leading-none">＋</span>
          <span className="text-xs font-semibold leading-tight">
            {uploading ? "Uploading…" : side.label}
          </span>
        </button>
      )}
    </div>
  );
}

function YesNoField({
  label,
  hint,
  value,
  onChange,
  options = ["yes", "no"],
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return (
    <Field label={label} hint={hint} required>
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
