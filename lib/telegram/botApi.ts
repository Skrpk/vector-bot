// Thin Telegram Bot API client for JSON methods (sendMessage / sendPhoto / …).
// `send-to-chat` builds its own multipart body for sendDocument; this is for the
// simpler JSON calls used by the APOD broadcast.

export interface BotResult {
  ok: boolean;
  description?: string;
  errorCode?: number;
  /** file_id of the sent media (video/photo/animation), for reuse across chats. */
  fileId?: string;
}

interface TgMessage {
  video?: { file_id?: string };
  animation?: { file_id?: string };
  photo?: { file_id?: string }[];
}

/** Pull the sent media's file_id out of a Bot API result message, if any. */
function fileIdOf(result: unknown): string | undefined {
  const m = result as TgMessage | undefined;
  if (m?.video?.file_id) return m.video.file_id;
  if (m?.animation?.file_id) return m.animation.file_id;
  if (Array.isArray(m?.photo) && m.photo.length)
    return m.photo[m.photo.length - 1].file_id;
  return undefined;
}

export async function callBot(
  botToken: string,
  method: string,
  body: Record<string, unknown>
): Promise<BotResult> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, description: 'network error' };
  }
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
    result?: unknown;
  } | null;
  return {
    ok: Boolean(data?.ok),
    description: data?.description,
    errorCode: data?.error_code,
    fileId: fileIdOf(data?.result),
  };
}

/** Like `callBot` but sends multipart/form-data (for uploading a file blob). */
export async function callBotForm(
  botToken: string,
  method: string,
  form: FormData
): Promise<BotResult> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      body: form,
    });
  } catch {
    return { ok: false, description: 'network error' };
  }
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
    result?: unknown;
  } | null;
  return {
    ok: Boolean(data?.ok),
    description: data?.description,
    errorCode: data?.error_code,
    fileId: fileIdOf(data?.result),
  };
}

/** Clickable "VECTOR APP" link (Telegram HTML) that opens the bot. */
export const VECTOR_APP_URL = 'https://t.me/vector_2049_bot';
export const VECTOR_APP_LABEL = 'VECTOR APP';
export const VECTOR_APP_HTML = `<a href="${VECTOR_APP_URL}">${VECTOR_APP_LABEL}</a>`;

/** Escape a plain string for Telegram's HTML parse mode. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Telegram-HTML tags we allow through from model-generated text. */
const ALLOWED_TAGS = ['b', 'i', 'u', 's'];

/**
 * Make model-generated text safe for Telegram's HTML parse mode: escape
 * everything, then re-enable only the allowed inline tags. Any other markup the
 * model emitted stays escaped (shown literally) rather than breaking the send.
 */
export function sanitizeTelegramHtml(text: string): string {
  let t = escapeHtml(text);
  for (const tag of ALLOWED_TAGS) {
    t = t
      .split(`&lt;${tag}&gt;`)
      .join(`<${tag}>`)
      .split(`&lt;/${tag}&gt;`)
      .join(`</${tag}>`);
  }
  return t;
}

/** Strip HTML tags — used to measure display length for caption budgeting. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
