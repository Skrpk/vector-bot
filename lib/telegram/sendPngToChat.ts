import { canvasToPngBlob } from '@/lib/sky/exportPng';

export type SendResult =
  { ok: true } | { ok: false; error: string; needsBotStart?: boolean };

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
  caption?: string
): Promise<SendResult> {
  let blob: Blob;
  try {
    blob = await canvasToPngBlob(canvas);
  } catch {
    return { ok: false, error: 'Could not read the image.' };
  }

  const form = new FormData();
  form.set('initData', initData);
  form.set('file', blob, filename);
  form.set('filename', filename);
  if (caption) form.set('caption', caption);

  let res: Response;
  try {
    res = await fetch('/api/send-to-chat', { method: 'POST', body: form });
  } catch {
    return { ok: false, error: 'Network error — could not send.' };
  }

  const data = (await res.json().catch(() => null)) as {
    ok: boolean;
    error?: string;
  } | null;

  if (res.ok && data?.ok) return { ok: true };

  if (data?.error === 'open-bot-first') {
    return {
      ok: false,
      error: 'Open a chat with the bot first, then try again.',
      needsBotStart: true,
    };
  }
  return { ok: false, error: data?.error ?? 'Could not send the image.' };
}
