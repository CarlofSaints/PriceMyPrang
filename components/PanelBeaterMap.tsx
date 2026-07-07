"use client";

import { useMemo, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import type { PanelBeater } from "@/lib/types";
import { Button } from "./ui";

// Johannesburg fallback centre.
const DEFAULT_CENTER = { lat: -26.2041, lng: 28.0473 };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function PanelBeaterMap({
  panelBeaters,
  userLocation,
  quotesRequested,
  selectedIds,
  onChange,
}: {
  panelBeaters: PanelBeater[];
  userLocation: { lat: number; lng: number } | null;
  quotesRequested: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [activeId, setActiveId] = useState<string | null>(null);

  const mapped = useMemo(
    () => panelBeaters.filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [panelBeaters]
  );

  const sorted = useMemo(() => {
    if (!userLocation) return mapped;
    return [...mapped].sort(
      (a, b) =>
        distanceKm(userLocation, { lat: a.lat!, lng: a.lng! }) -
        distanceKm(userLocation, { lat: b.lat!, lng: b.lng! })
    );
  }, [mapped, userLocation]);

  const center = userLocation ?? DEFAULT_CENTER;
  const active = sorted.find((p) => p.id === activeId) ?? null;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < quotesRequested) {
      onChange([...selectedIds, id]);
    }
  }

  if (!apiKey) {
    // Graceful fallback: no maps key configured → plain selectable list.
    return (
      <ListPicker
        list={sorted}
        userLocation={userLocation}
        selectedIds={selectedIds}
        quotesRequested={quotesRequested}
        toggle={toggle}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative h-[46vh] min-h-[300px] w-full overflow-hidden rounded-2xl border border-teal/20">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={center}
            defaultZoom={userLocation ? 12 : 10}
            gestureHandling="greedy"
            disableDefaultUI
            style={{ width: "100%", height: "100%" }}
          >
            {userLocation && <Marker position={userLocation} title="You are here" />}
            {sorted.map((p) => (
              <Marker
                key={p.id}
                position={{ lat: p.lat!, lng: p.lng! }}
                onClick={() => setActiveId(p.id)}
              />
            ))}
          </Map>
        </APIProvider>

        {active && (
          <div className="absolute inset-x-2 bottom-2 rounded-xl bg-white p-4 shadow-lg">
            <button
              onClick={() => setActiveId(null)}
              className="absolute right-3 top-3 text-ink/40"
              aria-label="Close"
            >
              ✕
            </button>
            <PBSummary pb={active} userLocation={userLocation} />
            <Button
              variant={selectedIds.includes(active.id) ? "coral" : "primary"}
              className="mt-3 w-full"
              onClick={() => toggle(active.id)}
              disabled={
                !selectedIds.includes(active.id) && selectedIds.length >= quotesRequested
              }
            >
              {selectedIds.includes(active.id) ? "Remove selection" : "Select this workshop"}
            </Button>
          </div>
        )}
      </div>

      <p className="text-sm text-ink/70">
        Selected {selectedIds.length} of {quotesRequested}. Tap a pin to review a workshop.
      </p>

      <ListPicker
        list={sorted}
        userLocation={userLocation}
        selectedIds={selectedIds}
        quotesRequested={quotesRequested}
        toggle={toggle}
        compact
      />
    </div>
  );
}

function PBSummary({
  pb,
  userLocation,
}: {
  pb: PanelBeater;
  userLocation: { lat: number; lng: number } | null;
}) {
  const dist =
    userLocation && pb.lat && pb.lng
      ? distanceKm(userLocation, { lat: pb.lat, lng: pb.lng })
      : null;
  return (
    <div>
      <h4 className="font-display text-lg font-semibold text-ink">
        {pb.tradingAs || pb.companyName}
      </h4>
      <p className="text-sm text-ink/70">{pb.physicalAddress}</p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/60">
        {dist !== null && <span>{dist.toFixed(1)} km away</span>}
        {pb.rmiNumber && <span>RMI {pb.rmiNumber}</span>}
        {pb.sambraNumber && <span>SAMBRA {pb.sambraNumber}</span>}
      </div>
    </div>
  );
}

function ListPicker({
  list,
  userLocation,
  selectedIds,
  quotesRequested,
  toggle,
  compact,
}: {
  list: PanelBeater[];
  userLocation: { lat: number; lng: number } | null;
  selectedIds: string[];
  quotesRequested: number;
  toggle: (id: string) => void;
  compact?: boolean;
}) {
  if (list.length === 0) {
    return (
      <p className="rounded-xl bg-amber/20 p-4 text-sm text-ink">
        No panel beaters are on the map yet. Please check back soon.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {list.map((pb) => {
        const selected = selectedIds.includes(pb.id);
        const atMax = !selected && selectedIds.length >= quotesRequested;
        return (
          <li
            key={pb.id}
            className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
              selected ? "border-coral bg-coral/5" : "border-teal/15 bg-white"
            }`}
          >
            <div className="min-w-0">
              <PBSummary pb={pb} userLocation={userLocation} />
            </div>
            {!compact && null}
            <Button
              size="md"
              variant={selected ? "coral" : "outline"}
              onClick={() => toggle(pb.id)}
              disabled={atMax}
              className="shrink-0"
            >
              {selected ? "Remove" : "Select"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
