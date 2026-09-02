"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { distanceKm, SERVICEABLE_KM, type LatLng } from "@/lib/geo";

export interface AssignableWorkshop {
  id: string;
  name: string;
  town: string;
  lat?: number;
  lng?: number;
}

/**
 * Put workshops on a job.
 *
 * This replaced the consumer choosing their own repairers off a map on
 * 2 Sep 2026. It is the ONLY route by which a job now reaches a repairer, so
 * two things matter more than they look:
 *
 *  - Ticking a box changes nothing until Save. Assigning emails the workshop,
 *    and a mis-click that sends a customer's photos to the wrong business is
 *    not undoable by unticking it afterwards.
 *  - Distance is shown, never enforced. Somebody will legitimately want a
 *    repairer 140 km away because the customer is moving the car anyway.
 */
export default function AssignWorkshops({
  reference,
  workshops,
  assigned,
  customer,
}: {
  reference: string;
  workshops: AssignableWorkshop[];
  assigned: string[];
  /** Where the vehicle is, when we managed to geocode it. */
  customer: LatLng | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(assigned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Nearest first when we know where the customer is: with coverage this thin,
  // the whole question is who is close enough to be worth calling.
  const ordered = useMemo(() => {
    const withDistance = workshops.map((w) => ({
      ...w,
      km:
        customer && typeof w.lat === "number" && typeof w.lng === "number"
          ? Math.round(distanceKm(customer, { lat: w.lat, lng: w.lng }) * 10) / 10
          : null,
    }));
    return withDistance.sort((a, b) => {
      if (a.km == null && b.km == null) return a.name.localeCompare(b.name);
      if (a.km == null) return 1;
      if (b.km == null) return -1;
      return a.km - b.km;
    });
  }, [workshops, customer]);

  const dirty =
    picked.length !== assigned.length || picked.some((id) => !assigned.includes(id));
  const newlyAdded = picked.filter((id) => !assigned.includes(id));

  function toggle(id: string) {
    setSaved(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelBeaterIds: picked }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not save the workshops.");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (workshops.length === 0) {
    return (
      <p className="rounded-lg bg-amber/20 px-3 py-2 text-sm text-ink">
        There are no active panel beaters to assign. Add one on the Panel beaters page, or
        reactivate a listing that has been switched off.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {ordered.map((w) => {
          const on = picked.includes(w.id);
          const isNew = newlyAdded.includes(w.id);
          return (
            <li key={w.id}>
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  on ? "border-teal bg-teal/5" : "border-ink/10 hover:bg-ink/5"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(w.id)}
                  className="mt-0.5 h-4 w-4 accent-teal"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{w.name}</span>
                  <span className="block text-xs text-ink/60">
                    {w.town}
                    {w.km != null && (
                      <>
                        {" · "}
                        <span className={w.km > SERVICEABLE_KM ? "text-coral" : "text-teal"}>
                          {w.km} km away
                        </span>
                      </>
                    )}
                    {w.km == null && customer && " · distance unknown"}
                  </span>
                </span>
                {isNew && (
                  <span className="shrink-0 rounded-full bg-amber/30 px-2 py-0.5 text-[11px] font-semibold text-ink">
                    will be emailed
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      )}

      {saved && !dirty && (
        <p className="rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal">
          Saved. Any newly assigned workshop has been emailed the job.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving..." : "Save workshops"}
        </Button>
        {dirty && newlyAdded.length > 0 && (
          <span className="text-xs text-ink/60">
            Saving emails {newlyAdded.length} workshop{newlyAdded.length > 1 ? "s" : ""}.
          </span>
        )}
      </div>
    </div>
  );
}
