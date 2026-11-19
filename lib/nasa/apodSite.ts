// Fallback APOD source: the WordPress JSON feed behind science.nasa.gov/apod/.
//
// Why this exists: api.nasa.gov/planetary/apod broke during NASA's move of APOD
// to science.nasa.gov — the undated call answers HTTP 500, and a dated call
// answers 200 with the new site's chrome (title "NASA Science", the site logo in
// place of the picture). The new site exposes its own feed, which is still real
// JSON — no HTML scraping — and carries the fields we need:
//
//   /wp-json/wp/v2/apod-basic          -> the latest 25 days, newest first
//   /wp-json/wp/v2/apod-basic/YYMMDD   -> one specific day
//
// robots.txt allows this path (`User-agent: * / Allow: /`). NASA's own media is
// public domain, but APOD images are frequently third-party copyrighted work by
// individual astrophotographers, so the `copyright` credit is carried through to
// the post (the sender renders it as "© …").
//
// Field shapes differ from the old API and are normalised here:
//   - `explanation` is HTML, wrapped in "Explanation:" / "Tomorrow's picture:"
//     markers that belong to the page, not the description.
//   - `url` is the ARTICLE page, not the media; `hdurl` is the image.
//   - on a video day there is no video file at all, only a .jpeg still — which
//     maps onto the sender's existing "thumbnail + watch link" path.

import { cleanCopyright, type ApodData } from './apodShared';

const FEED = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';

interface ApodSiteRaw {
  date?: string;
  title?: string;
  media_type?: string;
  explanation?: string;
  credit?: string;
  copyright?: string;
  permalink?: string;
  url?: string;
  hdurl?: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  deg: '°',
};

/** Turn the feed's HTML into the plain text the rest of the pipeline expects. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip the page's own framing from the description: it opens with an
 * "Explanation:" label and closes with a "Tomorrow's picture: …" teaser, neither
 * of which is part of the text.
 */
function cleanExplanation(html: string): string {
  const withoutTeaser = html.split(/<strong>\s*Tomorrow['’]s picture\s*:/i)[0];
  return htmlToText(withoutTeaser)
    .replace(/^\s*Explanation\s*:\s*/i, '')
    .trim();
}

/** 2026-11-18 -> "261118", the feed's per-day key. */
function toYymmdd(isoDate: string): string {
  return isoDate.slice(2).replace(/-/g, '');
}

function normalise(raw: ApodSiteRaw): ApodData | null {
  if (!raw.date || !raw.title) return null;
  const explanation = cleanExplanation(raw.explanation ?? '');
  if (!explanation) return null;

  const mediaType = raw.media_type ?? 'image';
  const media = raw.hdurl ?? null;
  const article = raw.permalink ?? raw.url ?? null;
  const isVideo = mediaType === 'video';

  return {
    source: 'site',
    date: raw.date,
    title: htmlToText(raw.title),
    explanation,
    mediaType,
    // A video day carries no video file, only a still. Point `url` at the
    // article so the sender posts the still plus a "watch" link to it.
    url: isVideo ? article : media,
    hdurl: isVideo ? null : media,
    thumbnailUrl: isVideo ? media : null,
    // Either field may be plain text or an <a> tag; both are credits.
    copyright: cleanCopyright(htmlToText(raw.copyright || raw.credit || '')),
  };
}

async function getJson(url: string): Promise<unknown | null> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Fetch one APOD day from the science.nasa.gov feed. Omit `date` for the latest.
 * Returns null on any failure, matching the api.nasa.gov client.
 */
export async function fetchApodFromSite(date?: string): Promise<ApodData | null> {
  if (date) {
    const one = (await getJson(`${FEED}/${toYymmdd(date)}`)) as ApodSiteRaw | null;
    return one ? normalise(one) : null;
  }
  // The undated feed is a list, newest first.
  const list = (await getJson(FEED)) as ApodSiteRaw[] | null;
  if (!Array.isArray(list) || list.length === 0) return null;
  return normalise(list[0]);
}
