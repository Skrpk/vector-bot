// Normalized geocoding shapes shared by the /api/geocode route and the UI.
// Both providers (Open-Meteo, Nominatim) are mapped onto GeoResult.

export interface GeoResult {
  /** Place name, e.g. "Prague". */
  name: string;
  /** admin1 region for disambiguation, e.g. "Prague" / "Oklahoma". */
  admin: string | null;
  /** Country name, e.g. "Czechia". */
  country: string | null;
  lat: number;
  lng: number;
  /**
   * IANA timezone, e.g. "Europe/Prague". Present from Open-Meteo; null from the
   * Nominatim fallback (which doesn't return one). A null timezone means the
   * caller must decide how to interpret local time (we treat it as UTC).
   */
  timezone: string | null;
}

export type GeoProvider = 'open-meteo' | 'nominatim' | 'none';

export interface GeocodeResponse {
  results: GeoResult[];
  provider: GeoProvider;
  /** Set when OSM/Nominatim data is included, per its attribution requirement. */
  attribution?: string;
}
