// Shared between the two APOD sources (api.nasa.gov and the science.nasa.gov
// site). Kept in its own module so neither source has to import the other.

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

/**
 * APOD's `copyright` is free-form and often carries a SECOND credit block for the
 * article text, e.g. "Javier Castro\n\nText:\nKeighley Rockcliffe  \n(NASA\nGSFC…)".
 * Rendered verbatim that becomes a five-line credit dump at the top of the post.
 * Keep only the image credit: cut at a "Text:" marker, flatten whitespace, cap it.
 */
export function cleanCopyright(raw?: string | null): string | null {
  if (!raw) return null;
  const imageCredit = raw.split(/\bText\s*:/i)[0];
  const flat = imageCredit.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > 80 ? flat.slice(0, 79).trimEnd() + '…' : flat;
}
