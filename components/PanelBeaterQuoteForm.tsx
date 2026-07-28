"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { MediaRef, PhotoSide, RequiredPhotos, VehicleDetails } from "@/lib/types";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import { Button, Field, inputClass } from "./ui";

const MAX_PHOTOS = 15;

// Same four full-vehicle shots the consumer form asks for.
const REQUIRED_SIDES: { key: PhotoSide; label: string; hint: string }[] = [
  { key: "front", label: "Front", hint: "Whole front of the car, straight on." },
  { key: "back", label: "Back", hint: "Whole rear of the car, straight on." },
  { key: "left", label: "Left side", hint: "Full driver's side, front to back." },
  { key: "right", label: "Right side", hint: "Full passenger's side, front to back." },
];

export interface RateOption {
  id: string;
  label: string;
}

async function uploadFile(file: File, prefix: string): Promise<MediaRef> {
  const blob = await upload(
    `requests/tmp/${prefix}/${Date.now()}-${safeFileName(file.name)}`,
    file,
    {
      access: "private",
      handleUploadUrl: "/api/media/upload",
      contentType: file.type || "application/octet-stream",
    }
  );
  return { url: mediaPath(blob.pathname), pathname: blob.pathname, contentType: file.type };
}

/**
 * The repairer's own intake form — deliberately not the consumer journey. No
 * video, no engine-damage question, no map step: the workshop already has the
 * car. Creates the request, then drops straight into the quote builder.
 */
export default function PanelBeaterQuoteForm({
  panelBeaters,
  lockedPbId,
  rateOptions,
}: {
  /** Workshops a manager/assessor can quote for. Empty when locked to one. */
  panelBeaters: { id: string; name: string }[];
  lockedPbId?: string;
  rateOptions: RateOption[];
}) {
  const router = useRouter();

  const [pbId, setPbId] = useState(lockedPbId ?? "");
  const [clientType, setClientType] = useState<"individual" | "company">("individual");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [rateCardId, setRateCardId] = useState("");
  const [underWarranty, setUnderWarranty] = useState<"yes" | "no" | "">("");
  const [thirdParty, setThirdParty] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleDetails>({});
  const [mileageKm, setMileageKm] = useState("");

  const [disc, setDisc] = useState<MediaRef | null>(null);
  const [discReading, setDiscReading] = useState(false);
  const [odo, setOdo] = useState<MediaRef | null>(null);
  const [odoReading, setOdoReading] = useState(false);
  const [requiredPhotos, setRequiredPhotos] = useState<RequiredPhotos>({});
  const [uploadingSide, setUploadingSide] = useState<PhotoSide | null>(null);
  const [photos, setPhotos] = useState<MediaRef[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsPbChoice = !lockedPbId && panelBeaters.length > 0;

  async function handleDisc(file: File) {
    setError(null);
    setDiscReading(true);
    try {
      const ref = await uploadFile(file, "disc");
      setDisc(ref);
      const res = await fetch("/api/disc/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: ref.pathname }),
      });
      if (res.ok) {
        const details = (await res.json()) as VehicleDetails;
        setVehicle((v) => ({ ...v, ...details }));
      }
    } catch {
      setError("Could not upload the licence disc photo. Please try again.");
    } finally {
      setDiscReading(false);
    }
  }

  async function handleOdometer(file: File) {
    setError(null);
    setOdoReading(true);
    try {
      const ref = await uploadFile(file, "odometer");
      setOdo(ref);
      const res = await fetch("/api/odometer/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: ref.pathname }),
      });
      if (res.ok) {
        const data = (await res.json()) as { km?: number };
        // Only fill a blank field — never overwrite what the repairer typed.
        if (typeof data.km === "number" && data.km > 0)
          setMileageKm((m) => (m.trim() ? m : String(data.km)));
      }
    } catch {
      setError("Could not upload the odometer photo. Please try again.");
    } finally {
      setOdoReading(false);
    }
  }

  async function handleSidePhoto(side: PhotoSide, file: File) {
    setError(null);
    setUploadingSide(side);
    try {
      const ref = await uploadFile(file, `sides/${side}`);
      setRequiredPhotos((p) => ({ ...p, [side]: ref }));
    } catch {
      setError(`Could not upload the ${side} photo. Please try again.`);
    } finally {
      setUploadingSide(null);
    }
  }

  async function handleDamagePhotos(files: FileList) {
    setError(null);
    setUploadingPhotos(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const refs = await Promise.all(picked.map((f) => uploadFile(f, "damage")));
      setPhotos((p) => [...p, ...refs]);
    } catch {
      setError("Could not upload those photos. Please try again.");
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function validate(): string | null {
    if (needsPbChoice && !pbId) return "Choose which workshop this quote is for.";
    if (clientType === "individual") {
      if (!firstName.trim() || !lastName.trim())
        return "Enter the client's first and last name.";
    } else {
      if (!companyName.trim()) return "Enter the company name.";
      if (!contactPerson.trim()) return "Enter the contact person.";
    }
    if (!email.trim()) return "Enter an email address.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return "Please enter a valid email address.";
    if (!phone.trim()) return "Enter a contact number.";
    if (!underWarranty) return "Say whether the vehicle is under warranty.";
    if (!vehicle.year?.trim()) return "Enter the vehicle year model.";
    if (!mileageKm.trim() || Number(mileageKm) <= 0) return "Enter the vehicle mileage.";
    const missing = REQUIRED_SIDES.find((s) => !requiredPhotos[s.key]);
    if (missing) return `Add the ${missing.label.toLowerCase()} photo of the vehicle.`;
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // A company's contact person fills the name fields — the reference is
      // built from the surname, and every downstream view expects a person.
      const [contactFirst, ...contactRest] = contactPerson.trim().split(/\s+/);
      const payload = {
        repairerQuote: true,
        selectedPanelBeaterIds: pbId ? [pbId] : [],
        firstName: clientType === "company" ? contactFirst || companyName.trim() : firstName.trim(),
        lastName:
          clientType === "company"
            ? contactRest.join(" ") || companyName.trim()
            : lastName.trim(),
        companyName: clientType === "company" ? companyName.trim() : undefined,
        email: email.trim(),
        phone: phone.trim(),
        rateCardId: rateCardId || undefined,
        underWarranty,
        isThirdPartyClaim: thirdParty ? "yes" : "no",
        // Not asked on this form — the repairer is pricing the job, not
        // triaging an insurance claim.
        hasInsurance: "no",
        isInsuranceClaim: "no",
        suspectedEngineDamage: "no",
        quotesRequested: 1,
        vehicle,
        mileageKm,
        odometerImage: odo,
        discImage: disc,
        requiredPhotos,
        damagePhotos: photos,
      };

      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create the job.");
        setBusy(false);
        return;
      }
      router.push(`/portal/quote-builder?ref=${data.reference}`);
    } catch {
      setError("Could not create the job. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {needsPbChoice && (
        <Field label="Which workshop is this quote for?" required>
          <select className={inputClass} value={pbId} onChange={(e) => setPbId(e.target.value)}>
            <option value="">Choose a workshop…</option>
            {panelBeaters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Client</h3>

        <Field label="Individual or company" required>
          <select
            className={inputClass}
            value={clientType}
            onChange={(e) => setClientType(e.target.value as "individual" | "company")}
          >
            <option value="individual">Individual</option>
            <option value="company">Company</option>
          </select>
        </Field>

        {clientType === "individual" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <input
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </Field>
            <Field label="Last name" required>
              <input
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </Field>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required>
              <input
                className={inputClass}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </Field>
            <Field label="Contact person" required>
              <input
                className={inputClass}
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                required
              />
            </Field>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Contact number" required>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="mb-3 font-display text-base font-semibold text-ink">The job</h3>

        <Field
          label="Rate card"
          hint={
            rateOptions.length
              ? "Which of your rate cards this job is priced against."
              : "You haven't set up any rate cards yet — add them on the Rates page."
          }
        >
          <select
            className={inputClass}
            value={rateCardId}
            onChange={(e) => setRateCardId(e.target.value)}
            disabled={rateOptions.length === 0}
          >
            <option value="">Choose a rate card…</option>
            {rateOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Is the vehicle under warranty?" required>
            <select
              className={inputClass}
              value={underWarranty}
              onChange={(e) => setUnderWarranty(e.target.value as "yes" | "no" | "")}
              required
            >
              <option value="">Choose…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Mileage (km)" required>
            <input
              className={inputClass}
              type="number"
              min="1"
              value={mileageKm}
              onChange={(e) => setMileageKm(e.target.value)}
              required
            />
          </Field>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={thirdParty}
            onChange={(e) => setThirdParty(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#00848d]"
          />
          <span>This is a third-party claim</span>
        </label>
      </div>

      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Vehicle</h3>

        <Field label="Licence disc photo" hint="We'll read the vehicle details off it.">
          <input
            className={inputClass}
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleDisc(e.target.files[0])}
          />
          {discReading && <p className="mt-2 text-sm text-teal">Reading the disc…</p>}
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Make">
            <input
              className={inputClass}
              value={vehicle.make ?? ""}
              onChange={(e) => setVehicle((v) => ({ ...v, make: e.target.value }))}
            />
          </Field>
          <Field label="Model">
            <input
              className={inputClass}
              value={vehicle.model ?? ""}
              onChange={(e) => setVehicle((v) => ({ ...v, model: e.target.value }))}
            />
          </Field>
          <Field label="Year model" required>
            <input
              className={inputClass}
              value={vehicle.year ?? ""}
              onChange={(e) => setVehicle((v) => ({ ...v, year: e.target.value }))}
              required
            />
          </Field>
          <Field label="Registration">
            <input
              className={inputClass}
              value={vehicle.registration ?? ""}
              onChange={(e) => setVehicle((v) => ({ ...v, registration: e.target.value }))}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Odometer photo" hint="Proof of the mileage above.">
            <input
              className={inputClass}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleOdometer(e.target.files[0])}
            />
            {odoReading && <p className="mt-2 text-sm text-teal">Reading the odometer…</p>}
            {odo && !odoReading && <p className="mt-2 text-sm text-teal">✓ Uploaded</p>}
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-teal/15 bg-white p-4">
        <h3 className="font-display text-base font-semibold text-ink">Photos</h3>
        <p className="mb-3 text-sm text-ink/60">
          All four sides of the vehicle are required, plus any close-ups of the damage.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {REQUIRED_SIDES.map((s) => (
            <Field key={s.key} label={s.label} hint={s.hint} required>
              <input
                className={inputClass}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleSidePhoto(s.key, e.target.files[0])}
              />
              {uploadingSide === s.key && (
                <p className="mt-1 text-xs text-ink/50">Uploading…</p>
              )}
              {requiredPhotos[s.key] && uploadingSide !== s.key && (
                <p className="mt-1 text-xs text-teal">✓ Uploaded</p>
              )}
            </Field>
          ))}
        </div>

        <div className="mt-4">
          <Field label="Damage photos" hint={`Up to ${MAX_PHOTOS}. Close-ups of the damage.`}>
            <input
              ref={photoInputRef}
              className={inputClass}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => e.target.files?.length && handleDamagePhotos(e.target.files)}
            />
            {uploadingPhotos && <p className="mt-1 text-xs text-ink/50">Uploading…</p>}
            {photos.length > 0 && (
              <p className="mt-1 text-xs text-teal">
                ✓ {photos.length} photo{photos.length === 1 ? "" : "s"} added
              </p>
            )}
          </Field>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Creating…" : "Create job & build quote"}
      </Button>
    </form>
  );
}
