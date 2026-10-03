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

/**
 * During NASA's move of the APOD site the API started answering with the new
 * site's CHROME instead of the picture: HTTP 200, a real `explanation`, but
 * `title: "NASA Science"` and `url`/`hdurl` pointing at the site logo
 * (`…/wp-content/themes/nasa-child/assets/images/nasa-logo@2x.png`). Broadcasting
 * that would send every subscriber a NASA logo, so treat it as no data at all.
 * Keyed on `/wp-content/` — the WordPress asset path of the site's own chrome,
 * never where an APOD picture lives (those sit under apod.nasa.gov/apod/image/).
 * Matching the title, or the word "nasa-logo", would instead risk rejecting a
 * legitimate picture that merely happens to be named that.
 */
function isPlaceholderMedia(url?: string): boolean {
  if (!url) return false;
  return /\/wp-content\//i.test(url);
}

/**
 * The same breakage also serves APOD's standing site blurb ("Discover the
 * cosmos! Each day a different image…") in place of the day's real text — for
 * most dates, including ones whose real write-up we have fetched before. Catch
 * it too, so a half-fix that restores the image but not the text can't ship a
 * post whose description is the site's own boilerplate.
 */
function isBoilerplateExplanation(explanation: string): boolean {
  return /^\s*Discover the cosmos!/i.test(explanation);
}

/** Today's date in Kyiv — the timezone the broadcast runs on. */
function kyivToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** One request. Returns null on transport error, non-2xx, or an unusable body. */
async function fetchApodOnce(date?: string): Promise<ApodData | null> {
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
  if (isPlaceholderMedia(raw.url) || isPlaceholderMedia(raw.hdurl)) {
    console.warn(`[apod] ${raw.date}: placeholder media from NASA, treating as no post`);
    return null;
  }
  if (isBoilerplateExplanation(raw.explanation)) {
    console.warn(`[apod] ${raw.date}: site boilerplate instead of a description`);
    return null;
  }

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

/**
 * Fetch today's APOD (or a specific `date`). Returns null on any failure.
 *
 * The undated "give me today" call is the flaky one — it has been answering 500
 * outright while the same request WITH an explicit `date` still works, so fall
 * back to asking for today's Kyiv date explicitly before giving up.
 */
export async function fetchApod(date?: string): Promise<ApodData | null> {
  if (date) return fetchApodOnce(date);
  return (await fetchApodOnce()) ?? (await fetchApodOnce(kyivToday()));
}
