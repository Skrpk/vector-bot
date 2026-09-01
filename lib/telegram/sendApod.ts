import {
  callBot,
  callBotForm,
  escapeHtml,
  stripTags,
  VECTOR_APP_HTML,
  VECTOR_APP_LABEL,
  type BotResult,
} from './botApi';
import type { ApodPost } from '@/lib/db/schema';

// Compose + deliver one APOD as a SINGLE post: the actual image / GIF / video
// with the title + description as its caption, so the user sees everything in one
// message and never has to follow a link. Telegram's caption limit is 1024, so a
// long description is truncated at a word boundary (a plain-text fallback message
// uses the 4096 limit and isn't truncated).
//
// The one case we can't embed is a YouTube/Vimeo video (not a downloadable file):
// there we post the thumbnail + a watch link. Direct .mp4 files upload via
// sendVideo (URL fetch ≤20 MB, else download + multipart upload ≤50 MB).

const UA_HEADER = '🔭 NASA · Астрономічне фото дня';
// Telegram limits: media caption 1024 chars, plain message 4096. We put title +
// description in ONE post (the media caption), truncating the description if the
// whole thing would exceed the caption limit.
const CAPTION_LIMIT = 1024;
const TEXT_LIMIT = 4096;

// Direct, downloadable media (Telegram can fetch and re-host these by URL).
const DIRECT_VIDEO = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const GIF = /\.gif(\?|$)/i;
// Telegram: sendVideo by URL fetches up to ~20 MB; a bot multipart upload up to
// 50 MB. Beyond 50 MB there's no Bot API option (falls back to thumbnail + link).
const URL_SEND_LIMIT = 20 * 1024 * 1024;
const UPLOAD_LIMIT = 50 * 1024 * 1024;

/** Content-Length of a URL, or 0 if unknown. */
async function contentLength(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return Number(r.headers.get('content-length') ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Download a ≤50 MB video and upload it to Telegram as a real video (used when a
 * direct file is too big for URL-send). Returns null to signal "fall back".
 */
async function uploadVideo(
  botToken: string,
  chatId: number,
  url: string,
  size: number,
  caption: string
): Promise<BotResult | null> {
  if (!size || size > UPLOAD_LIMIT) return null; // unknown size or over the bot cap
  let buf: ArrayBuffer;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    buf = await r.arrayBuffer();
  } catch {
    return null;
  }
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('caption', caption);
  form.set('parse_mode', 'HTML');
  form.set('supports_streaming', 'true');
  form.set('video', new Blob([buf], { type: 'video/mp4' }), 'apod.mp4');
  return callBotForm(botToken, 'sendVideo', form);
}

/** The canonical APOD page for a date: YYYY-MM-DD -> .../apYYMMDD.html */
function apodPageUrl(apodDate: string): string {
  const [y, m, d] = apodDate.split('-');
  return `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`;
}

/**
 * Build the single-post caption/message: title header, the description, then a
 * footer of links — a watch link when the media couldn't be embedded, plus the
 * original NASA APOD page (always). Blank lines separate each block. The
 * description is truncated at a word boundary so the whole thing fits `limit`
 * (1024 for a media caption, 4096 for a plain message). Length is budgeted on
 * plain text — HTML entity tags don't count toward Telegram's limit.
 */
function buildCaption(post: ApodPost, embedded: boolean, limit: number): string {
  const metaLine = `${UA_HEADER} · ${post.apodDate}`;
  const copyLine = post.copyright ? `© ${post.copyright}` : null;
  const headLines = [post.title, metaLine, ...(copyLine ? [copyLine] : [])];
  const headPlain = headLines.join('\n');

  // Footer links (each on its own line): optional watch link + the NASA page.
  const links: { plain: string; html: string }[] = [];
  if (!embedded && post.url) {
    links.push({
      plain: '🎬 Переглянути відео',
      html: `🎬 <a href="${escapeHtml(post.url)}">Переглянути відео</a>`,
    });
  }
  links.push({
    plain: '🔗 Оригінал на APOD',
    html: `🔗 <a href="${escapeHtml(apodPageUrl(post.apodDate))}">Оригінал на APOD</a>`,
  });
  // Links block, then a blank line, then the "VECTOR APP" link (opens the bot).
  const footerPlain = `\n\n${links.map((l) => l.plain).join('\n')}\n\n${VECTOR_APP_LABEL}`;
  const footerHtml = `\n\n${links.map((l) => l.html).join('\n')}\n\n${VECTOR_APP_HTML}`;

  const overhead = headPlain.length + 2 /* blank line */ + footerPlain.length;
  const budget = Math.max(0, limit - overhead);

  // Prefer the Ukrainian rewrite (already Telegram-safe HTML, with its own
  // paragraph breaks). It's short by construction; if it somehow overflows, drop
  // its formatting and truncate. Otherwise use the English original.
  const uk = post.explanationUk?.trim();
  let descHtml: string;
  if (uk && stripTags(uk).length <= budget) {
    descHtml = uk;
  } else {
    const plain = uk ? stripTags(uk) : post.explanation;
    descHtml =
      plain.length <= budget
        ? escapeHtml(plain)
        : escapeHtml(
            plain
              .slice(0, Math.max(0, budget - 1))
              .replace(/\s+\S*$/, '')
              .trimEnd() + '…'
          );
  }

  const headHtml =
    `<b>${escapeHtml(post.title)}</b>\n${escapeHtml(metaLine)}` +
    (copyLine ? `\n${escapeHtml(copyLine)}` : '');
  return `${headHtml}\n\n${descHtml}${footerHtml}`;
}

/**
 * Send the media itself. Returns whether the actual content was embedded (vs a
 * thumbnail/text fallback for un-downloadable videos), so the caller knows
 * whether to append a link.
 */
type MediaMethod = 'sendVideo' | 'sendPhoto' | 'sendAnimation' | 'sendMessage';
const MEDIA_PARAM: Record<MediaMethod, string> = {
  sendVideo: 'video',
  sendPhoto: 'photo',
  sendAnimation: 'animation',
  sendMessage: 'text',
};

/**
 * Cache of the media Telegram assigned on the first send, so a broadcast uploads
 * a big video once and re-sends it to everyone by `file_id` (cheap, no re-upload).
 * Create one per broadcast and pass it to each `sendApodPost` call.
 */
export interface MediaCache {
  method?: MediaMethod;
  fileId?: string;
  embedded?: boolean;
}

interface MediaSend {
  result: BotResult;
  embedded: boolean;
  method: MediaMethod;
}

async function sendMedia(
  botToken: string,
  chatId: number,
  post: ApodPost
): Promise<MediaSend> {
  const url = post.url;
  // Caption when the media IS embedded (no link) vs. a fallback (needs a link).
  const capEmbedded = buildCaption(post, true, CAPTION_LIMIT);
  const capFallback = buildCaption(post, false, CAPTION_LIMIT);
  const common = (caption: string) => ({
    chat_id: chatId,
    caption,
    parse_mode: 'HTML' as const,
  });

  // Animated GIF — APOD serves some under media_type 'image' with a .gif url.
  if (url && GIF.test(url)) {
    const r = await callBot(botToken, 'sendAnimation', {
      ...common(capEmbedded),
      animation: url,
    });
    if (r.ok) return { result: r, embedded: true, method: 'sendAnimation' };
  }

  // Direct video file (.mp4 etc.) — send it as a real video. Small files: let
  // Telegram fetch the URL. Larger (20–50 MB): download + upload ourselves.
  if (post.mediaType === 'video' && url && DIRECT_VIDEO.test(url)) {
    const size = await contentLength(url);
    if (!size || size <= URL_SEND_LIMIT) {
      const r = await callBot(botToken, 'sendVideo', {
        ...common(capEmbedded),
        video: url,
        supports_streaming: true,
      });
      if (r.ok) return { result: r, embedded: true, method: 'sendVideo' };
    }
    const uploaded = await uploadVideo(botToken, chatId, url, size, capEmbedded);
    if (uploaded?.ok) return { result: uploaded, embedded: true, method: 'sendVideo' };
    // Over 50 MB or unfetchable -> fall through to the thumbnail/text fallback.
  }

  // Still image.
  if (post.mediaType === 'image' && url) {
    const r = await callBot(botToken, 'sendPhoto', {
      ...common(capEmbedded),
      photo: url,
    });
    return { result: r, embedded: true, method: 'sendPhoto' };
  }

  // Un-embeddable video (YouTube/Vimeo) or a failed direct upload: thumbnail (+
  // watch link in the caption) if we have one, else a plain text message with the
  // full description (4096 limit) + link.
  if (post.thumbnailUrl) {
    const r = await callBot(botToken, 'sendPhoto', {
      ...common(capFallback),
      photo: post.thumbnailUrl,
    });
    return { result: r, embedded: false, method: 'sendPhoto' };
  }
  const r = await callBot(botToken, 'sendMessage', {
    chat_id: chatId,
    text: buildCaption(post, false, TEXT_LIMIT),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  return { result: r, embedded: false, method: 'sendMessage' };
}

/**
 * Send an APOD post to one chat as a SINGLE post — the media with the title +
 * description as its caption. Returns the send result so the caller can react to
 * per-user failures (e.g. blocked bot). Pass a shared `cache` across a broadcast
 * to reuse a big upload by `file_id`.
 */
export async function sendApodPost(
  botToken: string,
  chatId: number,
  post: ApodPost,
  cache?: MediaCache
): Promise<BotResult> {
  // Reuse the already-uploaded media by file_id (instant, no re-fetch).
  if (cache?.fileId && cache.method && cache.method !== 'sendMessage') {
    const caption = buildCaption(post, cache.embedded ?? true, CAPTION_LIMIT);
    const r = await callBot(botToken, cache.method, {
      chat_id: chatId,
      [MEDIA_PARAM[cache.method]]: cache.fileId,
      caption,
      parse_mode: 'HTML',
    });
    if (r.ok) return r;
    // file_id reuse failed — fall through to a full send.
  }

  const sent = await sendMedia(botToken, chatId, post);
  if (cache && sent.result.ok) {
    cache.method = sent.method;
    cache.fileId = sent.result.fileId;
    cache.embedded = sent.embedded;
  }
  return sent.result;
}
