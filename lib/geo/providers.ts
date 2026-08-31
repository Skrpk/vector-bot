import type { GeoResult } from './types';

// Server-side geocoding provider calls + normalizers. Never import this from
// client components — it is used only by the /api/geocode route handler.

const OPEN_METEO = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Default identifying User-Agent for Nominatim; override via env. */
const NOMINATIM_UA =
  process.env.NOMINATIM_USER_AGENT ??
  'vector-bot-starmap/1.0 (Telegram star-map mini app)';

// ---- Open-Meteo (primary) ---------------------------------------------------

interface OpenMeteoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
}

/**
 * Open-Meteo only matches a query against names in the requested `language`, so a
 * Cyrillic query with `language=en` returns nothing. Pick the language from the
 * query's script (Ukrainian for Cyrillic — our audience), else English.
 */
function languageForQuery(q: string): string {
  if (/[Ѐ-ӿ]/.test(q)) return 'uk'; // Cyrillic
  return 'en';
}

export async function openMeteoSearch(
  q: string,
  limit: number,
  signal?: AbortSignal
): Promise<GeoResult[]> {
  const language = languageForQuery(q);
  const url = `${OPEN_METEO}?name=${encodeURIComponent(q)}&count=${limit}&language=${language}&format=json`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = (await res.json()) as { results?: OpenMeteoResult[] };
  if (!json.results?.length) return [];
  return json.results.map((r) => ({
    name: r.name,
    admin: r.admin1 ?? null,
    country: r.country ?? null,
    lat: r.latitude,
    lng: r.longitude,
    timezone: r.timezone ?? null,
  }));
}

// ---- Nominatim (fallback only) ----------------------------------------------

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
}

function nominatimName(r: NominatimResult): string {
  const a = r.address ?? {};
  return (
    a.city ??
    a.town ??
    a.village ??
    a.hamlet ??
    a.municipality ??
    r.name ??
    r.display_name?.split(',')[0] ??
    'Unknown'
  );
}

/**
 * Nominatim usage policy requires an identifying User-Agent and a strict ~1 req/s
 * limit. Callers must enforce the rate limit; this only sets headers. Returns
 * results with timezone: null (Nominatim doesn't provide one).
 */
export async function nominatimSearch(
  q: string,
  limit: number,
  signal?: AbortSignal
): Promise<GeoResult[]> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=${limit}`;
  const res = await fetch(url, {
    signal,
    headers: {
      'User-Agent': NOMINATIM_UA,
      'Accept-Language': 'en',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = (await res.json()) as NominatimResult[];
  if (!Array.isArray(json) || json.length === 0) return [];
  return json.map((r) => ({
    name: nominatimName(r),
    admin: r.address?.state ?? null,
    country: r.address?.country ?? null,
    lat: Number(r.lat),
    lng: Number(r.lon),
    timezone: null,
  }));
}
