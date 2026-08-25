export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Human-readable label for the location (used in the poster subtitle). */
  label: string;
}

/**
 * Resolve a location query to coordinates.
 *
 * STUB (Milestone 1): only parses a raw "lat, lng" pair (e.g. "40.7128, -74.006").
 * Returns null if the input is not a valid coordinate pair.
 *
 * TODO(milestone-2): integrate a real geocoding provider (e.g. a permissively
 * licensed / self-hostable one such as Nominatim or a keyed service) so users
 * can type a place name. Keep this signature so callers don't change.
 */
export function geocode(query: string): GeocodeResult | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(query);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!isValidLat(lat) || !isValidLng(lng)) return null;
  return { lat, lng, label: formatCoords(lat, lng) };
}

export function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLng(lng: number): boolean {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Pretty coordinate string, e.g. "40.71° N, 74.01° W". */
export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`;
}
