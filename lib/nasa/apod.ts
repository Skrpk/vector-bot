// NASA "Astronomy Picture of the Day" client.
// Docs: https://api.nasa.gov/ (planetary/apod). Keyless with DEMO_KEY, but that
// is heavily rate-limited (~50/day) — set NASA_API_KEY for real use. We only
// call it once per day (the cron), so usage stays tiny either way.

export interface ApodData {
  date: string; // YYYY-MM-DD
  title: string;
  explanation: string;
  mediaType: string; // 'image' | 'video' | ...
  url: string | null;
  hdurl: string | null;
  thumbnailUrl: string | null;
  copyright: string | null;
}

interface ApodRaw {
  date?: string;
  title?: string;
  explanation?: string;
  media_type?: string;
  url?: string;
  hdurl?: string;
  thumbnail_url?: string;
  copyright?: string;
}

/**
 * APOD's `copyright` is free-form and often carries a SECOND credit block for the
 * article text, e.g. "Javier Castro\n\nText:\nKeighley Rockcliffe  \n(NASA\nGSFC…)".
 * Rendered verbatim that becomes a five-line credit dump at the top of the post.
 * Keep only the image credit: cut at a "Text:" marker, flatten whitespace, cap it.
 */
function cleanCopyright(raw?: string): string | null {
  if (!raw) return null;
  const imageCredit = raw.split(/\bText\s*:/i)[0];
  const flat = imageCredit.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > 80 ? flat.slice(0, 79).trimEnd() + '…' : flat;
}

/** Fetch today's APOD (or a specific `date`). Returns null on any failure. */
export async function fetchApod(date?: string): Promise<ApodData | null> {
  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const params = new URLSearchParams({ api_key: key, thumbs: 'true' });
  if (date) params.set('date', date);

  let res: Response;
  try {
    res = await fetch(`https://api.nasa.gov/planetary/apod?${params}`, {
      // Always hit the network; we do our own DB caching.
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const raw = (await res.json().catch(() => null)) as ApodRaw | null;
  if (!raw?.date || !raw.title || !raw.explanation) return null;

  return {
    date: raw.date,
    title: raw.title,
    explanation: raw.explanation,
    mediaType: raw.media_type ?? 'image',
    url: raw.url ?? null,
    hdurl: raw.hdurl ?? null,
    // NASA returns "" for non-video thumbs; normalize to null.
    thumbnailUrl: raw.thumbnail_url || null,
    copyright: cleanCopyright(raw.copyright),
  };
}
