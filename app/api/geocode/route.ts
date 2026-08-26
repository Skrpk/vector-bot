import { NextResponse } from 'next/server';
import { nominatimSearch, openMeteoSearch } from '@/lib/geo/providers';
import type { GeocodeResponse } from '@/lib/geo/types';

// Geocoding proxy: keeps provider calls server-side so we can set headers,
// respect Nominatim's rate limit, cache, and avoid CORS. Free + keyless.

export const runtime = 'nodejs';

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 10;

// --- In-memory cache (per warm serverless instance) --------------------------
// TODO(milestone-2: persistent cache) back this with a shared store (e.g. the
// planned PlanetScale) so popular-city lookups survive cold starts / instances.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_MAX = 500;
const cache = new Map<string, { ts: number; data: GeocodeResponse }>();

function cacheGet(key: string): GeocodeResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key: string, data: GeocodeResponse): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { ts: Date.now(), data });
}

// --- Nominatim rate guard (best-effort, per instance) ------------------------
const NOMINATIM_MIN_INTERVAL_MS = 1000;
let lastNominatimAt = 0;

async function throttleNominatim(): Promise<void> {
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
}

export async function GET(request: Request): Promise<NextResponse<GeocodeResponse>> {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT)
  );

  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ results: [], provider: 'none' });
  }

  const key = `${q.toLowerCase()}|${limit}`;
  const cached = cacheGet(key);
  if (cached) return NextResponse.json(cached);

  let response: GeocodeResponse;
  try {
    const primary = await openMeteoSearch(q, limit);
    if (primary.length > 0) {
      response = { results: primary, provider: 'open-meteo' };
    } else {
      // Fall back to Nominatim only when Open-Meteo has nothing.
      await throttleNominatim();
      const fallback = await nominatimSearch(q, limit);
      response =
        fallback.length > 0
          ? {
              results: fallback,
              provider: 'nominatim',
              attribution: OSM_ATTRIBUTION,
            }
          : { results: [], provider: 'none' };
    }
  } catch (err) {
    console.error('[geocode] provider error:', err);
    // Never crash the client — return a clean empty result.
    return NextResponse.json({ results: [], provider: 'none' });
  }

  cacheSet(key, response);
  return NextResponse.json(response);
}
