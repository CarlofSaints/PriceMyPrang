export interface GeocodeResult {
  ok: boolean;
  lat?: number;
  lng?: number;
  status: string; // Google status, or a local reason
  error?: string; // Google error_message, if any
  keySource: "GEOCODING_API_KEY" | "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" | "none";
}

// Geocode with full status info (used by the diagnostic endpoint + save flow).
export async function geocodeWithStatus(address: string): Promise<GeocodeResult> {
  const key = process.env.GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const keySource = process.env.GEOCODING_API_KEY
    ? "GEOCODING_API_KEY"
    : process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      ? "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
      : "none";
  if (!key) return { ok: false, status: "NO_KEY", keySource };
  if (!address.trim()) return { ok: false, status: "NO_ADDRESS", keySource };

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", "za");
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      status: string;
      error_message?: string;
      results: { geometry: { location: { lat: number; lng: number } } }[];
    };
    if (data.status === "OK" && data.results[0]) {
      return { ok: true, ...data.results[0].geometry.location, status: "OK", keySource };
    }
    return { ok: false, status: data.status || "UNKNOWN", error: data.error_message, keySource };
  } catch (err) {
    return { ok: false, status: "FETCH_ERROR", error: (err as Error).message, keySource };
  }
}

// Convenience wrapper — just the coordinates (or null).
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const r = await geocodeWithStatus(address);
  return r.ok && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
}
