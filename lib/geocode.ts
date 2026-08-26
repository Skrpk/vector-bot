export interface ParsedCoords {
  lat: number;
  lng: number;
  /** Human-readable label for the location (used in the poster subtitle). */
  label: string;
}

/**
 * Parse a raw "lat, lng" pair (e.g. "40.7128, -74.006") for the manual-entry
 * fallback. Returns null if the input is not a valid coordinate pair.
 *
 * City-name search now goes through /api/geocode (Open-Meteo + Nominatim); this
 * remains only for power users typing coordinates directly. Such input has no
 * known timezone, so the caller treats the entered time as UTC.
 */
export function parseCoords(query: string): ParsedCoords | null {
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
