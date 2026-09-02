/**
 * Distance and the province list, shared by the consumer form, the request
 * API and the portal.
 *
 * Split out of PanelBeaterMap on 2 Sep 2026: the consumer no longer picks a
 * workshop off a map, but we still need to know how far the nearest one is, so
 * the maths outlived the component that owned it.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in km. Straight line, not driving distance. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far the closest of these points is, or null when either side has nothing
 * to measure. Null means "we could not tell", never "nothing is near": the two
 * read the same on screen and must not be confused.
 */
export function nearestKm(from: LatLng | null, points: Partial<LatLng>[]): number | null {
  if (!from) return null;
  const usable = points.filter(
    (p): p is LatLng => typeof p.lat === "number" && typeof p.lng === "number"
  );
  if (usable.length === 0) return null;
  return Math.round(Math.min(...usable.map((p) => distanceKm(from, p))) * 10) / 10;
}

/**
 * Beyond this, calling a repairer "near you" is not honest. A quote needs the
 * car physically on the premises, so this is about whether somebody would
 * actually drive it there, not about a map radius.
 */
export const SERVICEABLE_KM = 100;

/** The nine provinces, as a South African would name them. */
export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
] as const;

export type Province = (typeof PROVINCES)[number];
