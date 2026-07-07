// Geocode a physical address to lat/lng using the Google Geocoding API.
// Uses GEOCODING_API_KEY, falling back to the public maps key.
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const key =
    process.env.GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || !address.trim()) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", "za");
    url.searchParams.set("key", key);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results: { geometry: { location: { lat: number; lng: number } } }[];
    };
    if (data.status !== "OK" || !data.results[0]) return null;
    return data.results[0].geometry.location;
  } catch {
    return null;
  }
}
