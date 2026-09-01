import { NextResponse } from 'next/server';
import { verifyInitData } from '@/lib/telegram/verifyInitData';
import { checkChannelMembership } from '@/lib/telegram/channelMembership';
import { recordDownload } from '@/lib/db/queries';
import { VECTOR_APP_HTML } from '@/lib/telegram/botApi';
import type { DownloadMeta } from '@/lib/db/downloadMeta';

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

  // Channel-subscription gate (no-op if TELEGRAM_CHANNEL_ID is unset).
  const membership = await checkChannelMembership(botToken, verified.user.id);
  if ('error' in membership) {
    // A misconfigured gate (e.g. bot not admin) shouldn't hard-block delivery —
    // log and fall through so the image still sends.
    console.error('[send-to-chat] membership check failed:', membership.error);
  } else if ('subscribed' in membership && membership.subscribed === false) {
    return NextResponse.json(
      { ok: false, error: 'not-subscribed', channelUrl: membership.channelUrl },
      { status: 403 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) return fail(400, 'missing file');
  if (file.size === 0) return fail(400, 'empty file');
  if (file.size > MAX_BYTES) return fail(413, 'file too large');

  const filename = (() => {
    const f = form.get('filename');
    return typeof f === 'string' && f ? f : 'star-map.png';
  })();
  const meta = (() => {
    const m = form.get('meta');
    if (typeof m !== 'string' || !m) return null;
    try {
      return JSON.parse(m) as DownloadMeta;
    } catch {
      return null;
    }
  })();

  // Re-wrap into a fresh multipart body for the Bot API. `document` preserves the
  // PNG byte-for-byte (unlike `sendPhoto`, which recompresses).
  const tgForm = new FormData();
  tgForm.set('chat_id', String(verified.user.id));
  tgForm.set('document', file, filename);
  // Caption is a clickable "VECTOR APP" link back to the bot.
  tgForm.set('caption', VECTOR_APP_HTML);
  tgForm.set('parse_mode', 'HTML');

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

  // Log the download (metadata only). Best-effort — a DB hiccup must not fail a
  // send the user already received. Skipped when the DB isn't configured.
  if (process.env.DATABASE_URL && meta) {
    try {
      await recordDownload(verified.user, meta);
    } catch (err) {
      console.error('[send-to-chat] failed to log download:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
