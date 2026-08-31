import { NextResponse } from 'next/server';
import { verifyInitData } from '@/lib/telegram/verifyInitData';

// Relay route: the render stays 100% client-side (hard constraint). The client
// POSTs the finished PNG here; we validate the Telegram initData signature,
// derive the user's chat_id, and have the bot deliver the file into that chat
// via `sendDocument`. Inside Telegram's webview a plain browser download does
// not work, so this is the only reliable way to hand the user their image.

export const runtime = 'nodejs';

// Telegram Bot API caps uploaded files at 50 MB; our PNGs are a few MB. Guard
// anyway so a malformed request can't stream something huge into a function.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return fail(500, 'server not configured');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'expected multipart/form-data');
  }

  const initData = form.get('initData');
  if (typeof initData !== 'string') return fail(400, 'missing initData');

  const verified = verifyInitData(initData, botToken);
  if (!verified.ok) return fail(401, `unauthorized: ${verified.reason}`);

  const file = form.get('file');
  if (!(file instanceof Blob)) return fail(400, 'missing file');
  if (file.size === 0) return fail(400, 'empty file');
  if (file.size > MAX_BYTES) return fail(413, 'file too large');

  const filename = (() => {
    const f = form.get('filename');
    return typeof f === 'string' && f ? f : 'star-map.png';
  })();
  const caption = (() => {
    const c = form.get('caption');
    return typeof c === 'string' && c ? c : undefined;
  })();

  // Re-wrap into a fresh multipart body for the Bot API. `document` preserves the
  // PNG byte-for-byte (unlike `sendPhoto`, which recompresses).
  const tgForm = new FormData();
  tgForm.set('chat_id', String(verified.user.id));
  tgForm.set('document', file, filename);
  if (caption) tgForm.set('caption', caption);

  let tgRes: Response;
  try {
    tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: tgForm,
    });
  } catch {
    return fail(502, 'could not reach Telegram');
  }

  const data = (await tgRes.json().catch(() => null)) as {
    ok: boolean;
    description?: string;
  } | null;

  if (!data?.ok) {
    // Common case: the user never started the bot -> "chat not found" / "bot
    // can't initiate conversation". Surface a friendly hint for that.
    const description = data?.description ?? 'unknown Telegram error';
    const needsStart = /chat not found|can't initiate|bot was blocked/i.test(description);
    return NextResponse.json(
      {
        ok: false,
        error: needsStart ? 'open-bot-first' : description,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
