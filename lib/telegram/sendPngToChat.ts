import { canvasToPngBlob } from '@/lib/sky/exportPng';
import type { DownloadMeta } from '@/lib/db/downloadMeta';

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; needsBotStart?: boolean }
  | { ok: false; notSubscribed: true; error: string; channelUrl: string };

/**
 * Send a canvas as a PNG document into the user's Telegram chat, via the
 * `/api/send-to-chat` relay (which validates `initData` and calls the Bot API).
 *
 * Used inside the Telegram webview, where a plain browser download is blocked.
 * `initData` is the raw signed string from the Mini App SDK.
 */
export async function sendPngToChat(
  canvas: HTMLCanvasElement,
  filename: string,
  initData: string,
  caption?: string,
  meta?: DownloadMeta
): Promise<SendResult> {
  let blob: Blob;
  try {
    blob = await canvasToPngBlob(canvas);
  } catch {
    return { ok: false, error: 'Не вдалося зчитати зображення.' };
  }

  const form = new FormData();
  form.set('initData', initData);
  form.set('file', blob, filename);
  form.set('filename', filename);
  if (caption) form.set('caption', caption);
  if (meta) form.set('meta', JSON.stringify(meta));

  let res: Response;
  try {
    res = await fetch('/api/send-to-chat', { method: 'POST', body: form });
  } catch {
    return { ok: false, error: 'Помилка мережі — не вдалося надіслати.' };
  }

  const data = (await res.json().catch(() => null)) as {
    ok: boolean;
    error?: string;
    channelUrl?: string;
  } | null;

  if (res.ok && data?.ok) return { ok: true };

  if (data?.error === 'not-subscribed') {
    return {
      ok: false,
      notSubscribed: true,
      channelUrl: data.channelUrl ?? '',
      error:
        'Підпишіться на канал, щоб надіслати зображення: перейдіть за посиланням, ' +
        'натисніть «Підписатися», поверніться та натисніть кнопку ще раз.',
    };
  }

  if (data?.error === 'open-bot-first') {
    return {
      ok: false,
      error: 'Спершу відкрийте чат із ботом, потім спробуйте ще раз.',
      needsBotStart: true,
    };
  }
  // Any other server/Telegram error is technical (often an English Telegram
  // description) — log it but show the user a localized generic message.
  if (data?.error) console.error('[send-to-chat]', data.error);
  return { ok: false, error: 'Не вдалося надіслати зображення.' };
}
