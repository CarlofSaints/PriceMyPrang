"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_OUTCOMES,
  COMPLAINT_OUTCOME_LABEL,
  COMPLAINT_MAX_WORDS,
  VEHICLE_SAFETY_LABEL,
  type ComplaintCategory,
  type ComplaintOutcome,
  type VehicleSafety,
} from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

export type FeedbackContext = {
  reference: string;
  firstName: string;
  vehicle: string;
  registration: string | null;
  workshops: { id: string; name: string }[];
  existingRating: { score: number; comment?: string } | null;
};

type Uploaded = { url: string; pathname: string; contentType?: string; isVideo: boolean };

const MAX_PHOTOS = 5;
const MAX_VIDEO_SECONDS = 20;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export default function FeedbackFlow({
  token,
  ctx,
}: {
  token: string;
  ctx: FeedbackContext;
}) {
  const [mode, setMode] = useState<"choose" | "rate" | "complain">("choose");
  const [done, setDone] = useState<"rating" | "complaint" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [panelBeaterId, setPanelBeaterId] = useState(ctx.workshops[0]?.id ?? "");

  // Rating
  const [score, setScore] = useState(ctx.existingRating?.score ?? 0);
  const [comment, setComment] = useState(ctx.existingRating?.comment ?? "");

  // Complaint
  const [category, setCategory] = useState<ComplaintCategory>("workmanship");
  const [description, setDescription] = useState("");
  const [vehicleSafety, setVehicleSafety] = useState<VehicleSafety | "">("");
  const [desiredOutcome, setDesiredOutcome] = useState<ComplaintOutcome | "">("");
  const [collectedOn, setCollectedOn] = useState("");
  const [problemNoticedOn, setProblemNoticedOn] = useState("");
  const [stillWithRepairer, setStillWithRepairer] = useState<"" | "yes" | "no">("");
  const [raisedWithRepairer, setRaisedWithRepairer] = useState<"" | "yes" | "no">("");
  const [media, setMedia] = useState<Uploaded[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const photos = media.filter((m) => !m.isVideo);
  const video = media.find((m) => m.isVideo);
  const overLimit = words(description) > COMPLAINT_MAX_WORDS;

  /** Read a clip's duration in the browser, so a long one is refused before it uploads. */
  function videoSeconds(file: File): Promise<number> {
    return new Promise((resolve) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(el.src);
        resolve(el.duration || 0);
      };
      // Undecodable in this browser — let it through rather than block a
      // legitimate complaint over a format we couldn't measure.
      el.onerror = () => resolve(0);
      el.src = URL.createObjectURL(file);
    });
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");

        if (isVideo && video) {
          setError("You can attach one video. Remove the current one first.");
          continue;
        }
        if (!isVideo && photos.length >= MAX_PHOTOS) {
          setError(`Up to ${MAX_PHOTOS} photos.`);
          continue;
        }
        if (isVideo) {
          const secs = await videoSeconds(file);
          if (secs > MAX_VIDEO_SECONDS + 1) {
            setError(
              `That clip is ${Math.round(secs)} seconds. Please keep it to ${MAX_VIDEO_SECONDS}.`
            );
            continue;
          }
        }

        const blob = await upload(
          `complaints/${ctx.reference}/${Date.now()}-${safeFileName(file.name)}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/media/upload",
            contentType: file.type || "application/octet-stream",
          }
        );
        setMedia((m) => [
          ...m,
          {
            url: mediaPath(blob.pathname),
            pathname: blob.pathname,
            contentType: file.type || undefined,
            isVideo,
          },
        ]);
      }
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, panelBeaterId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setDone(data.kind);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Done ----------------------------------------------------------------
  if (done) {
    return (
      <div className="pmp-card space-y-3 p-6 text-center">
        <h2 className="font-display text-xl font-bold text-ink">
          {done === "rating" ? "Thank you" : "We've got it"}
        </h2>
        <p className="text-sm text-ink/70">
          {done === "rating"
            ? "Your rating helps the next customer choose well, and it helps good repairers stand out."
            : "We have received your complaint. A copy has been sent to the repairer. We will be dealing with this as a matter of urgency and will be in touch shortly."}
        </p>
        <p className="text-xs text-ink/50">Reference {ctx.reference}</p>
      </div>
    );
  }

  const workshopPicker =
    ctx.workshops.length > 1 ? (
      <Field label="Which repairer?" required>
        <select
          className={inputClass}
          value={panelBeaterId}
          onChange={(e) => setPanelBeaterId(e.target.value)}
        >
          {ctx.workshops.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </Field>
    ) : null;

  // ---- Choose --------------------------------------------------------------
  if (mode === "choose") {
    return (
      <div className="space-y-4">
        <div className="pmp-card p-6">
          <p className="text-sm text-ink/60">Reference {ctx.reference}</p>
          <p className="mt-1 font-display text-lg font-semibold text-ink">
            {ctx.vehicle || "Your vehicle"}
            {ctx.registration ? ` · ${ctx.registration}` : ""}
          </p>
          {ctx.workshops.length === 1 && (
            <p className="mt-1 text-sm text-ink/60">Repaired by {ctx.workshops[0].name}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMode("rate")}
          className="pmp-card w-full p-6 text-left transition-shadow hover:shadow-md"
        >
          <h2 className="font-display text-lg font-bold text-ink">Rate your repairer</h2>
          <p className="mt-1 text-sm text-ink/60">
            Out of 5, with a comment if you like. Ratings and comments are shown publicly on the
            repairer&apos;s listing.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("complain")}
          className="pmp-card w-full p-6 text-left transition-shadow hover:shadow-md"
        >
          <h2 className="font-display text-lg font-bold text-ink">Something went wrong</h2>
          <p className="mt-1 text-sm text-ink/60">
            Raise a complaint. This is <strong>not</strong> published — it goes to us and to the
            repairer so it can be put right.
          </p>
        </button>
      </div>
    );
  }

  // ---- Rate ----------------------------------------------------------------
  if (mode === "rate") {
    return (
      <div className="pmp-card space-y-5 p-6">
        <h2 className="font-display text-lg font-bold text-ink">Rate your repairer</h2>
        {workshopPicker}

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">How did they do?</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setScore(n)}
                aria-label={`${n} out of 5`}
                className={`text-4xl leading-none transition-colors ${
                  n <= score ? "text-amber" : "text-ink/15 hover:text-ink/30"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <Field label="Anything you'd like to add?" hint="Shown publicly on their listing.">
          <textarea
            className={`${inputClass} min-h-24`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            disabled={busy || score < 1}
            onClick={() => send({ kind: "rating", score, comment })}
          >
            {busy ? "Sending…" : "Submit rating"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  // ---- Complain ------------------------------------------------------------
  return (
    <div className="pmp-card space-y-5 p-6">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Raise a complaint</h2>
        {/* Said BEFORE they write, not after they send. People choose their
            words differently knowing the repairer will read them, and it is
            fairer to both sides. */}
        <p className="mt-1 text-sm text-ink/70">
          This goes to Price my Prang <strong>and to the repairer</strong>, so they can put it
          right. It is never published.
        </p>
      </div>

      {workshopPicker}

      <Field label="What's it about?" required>
        <select
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
        >
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {COMPLAINT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="What happened?"
        required
        hint={`Up to ${COMPLAINT_MAX_WORDS} words — ${words(description)} so far.`}
      >
        <textarea
          className={`${inputClass} min-h-40 ${overLimit ? "border-coral" : ""}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what went wrong, in your own words."
        />
      </Field>

      <Field label="Is the car safe to drive?">
        <select
          className={inputClass}
          value={vehicleSafety}
          onChange={(e) => setVehicleSafety(e.target.value as VehicleSafety | "")}
        >
          <option value="">Prefer not to say</option>
          {(["safe", "unsafe", "unsure"] as const).map((v) => (
            <option key={v} value={v}>
              {VEHICLE_SAFETY_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When did you collect the car?">
          <input
            type="date"
            className={inputClass}
            value={collectedOn}
            onChange={(e) => setCollectedOn(e.target.value)}
          />
        </Field>
        <Field label="When did you notice the problem?">
          <input
            type="date"
            className={inputClass}
            value={problemNoticedOn}
            onChange={(e) => setProblemNoticedOn(e.target.value)}
          />
        </Field>
        <Field label="Is the car still with them?">
          <select
            className={inputClass}
            value={stillWithRepairer}
            onChange={(e) => setStillWithRepairer(e.target.value as "" | "yes" | "no")}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No, I have it</option>
          </select>
        </Field>
        <Field label="Have you raised it with them?">
          <select
            className={inputClass}
            value={raisedWithRepairer}
            onChange={(e) => setRaisedWithRepairer(e.target.value as "" | "yes" | "no")}
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">Not yet</option>
          </select>
        </Field>
      </div>

      <Field label="What would put this right?">
        <select
          className={inputClass}
          value={desiredOutcome}
          onChange={(e) => setDesiredOutcome(e.target.value as ComplaintOutcome | "")}
        >
          <option value="">—</option>
          {COMPLAINT_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {COMPLAINT_OUTCOME_LABEL[o]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Photos or a short video"
        hint={`Up to ${MAX_PHOTOS} photos and one clip of ${MAX_VIDEO_SECONDS} seconds.`}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-teal/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-teal"
        />
      </Field>

      {uploading && <p className="text-sm text-ink/60">Uploading…</p>}

      {media.length > 0 && (
        <ul className="space-y-1 text-sm">
          {media.map((m) => (
            <li key={m.pathname} className="flex items-center gap-2">
              <span className="text-ink/80">{m.isVideo ? "Video" : "Photo"}</span>
              <button
                type="button"
                className="text-xs text-coral underline"
                onClick={() => setMedia((l) => l.filter((x) => x.pathname !== m.pathname))}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy || uploading || !description.trim() || overLimit}
          onClick={() =>
            send({
              kind: "complaint",
              category,
              description,
              vehicleSafety: vehicleSafety || undefined,
              desiredOutcome: desiredOutcome || undefined,
              collectedOn: collectedOn || undefined,
              problemNoticedOn: problemNoticedOn || undefined,
              stillWithRepairer:
                stillWithRepairer === "" ? undefined : stillWithRepairer === "yes",
              raisedWithRepairer:
                raisedWithRepairer === "" ? undefined : raisedWithRepairer === "yes",
              media,
            })
          }
        >
          {busy ? "Sending…" : "Submit complaint"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
          Back
        </Button>
      </div>

      <p className="text-xs text-ink/50">
        We already have your name and contact details from your job, so there&apos;s nothing else
        to fill in.
      </p>
    </div>
  );
}
