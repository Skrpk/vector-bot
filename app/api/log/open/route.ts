import { NextResponse } from 'next/server';
import { verifyInitData } from '@/lib/telegram/verifyInitData';
import { logUserEvent } from '@/lib/telegram/logEvent';

// Fired once when the Mini App boots inside Telegram, so the log channel records
// "opened the generator" (there is no other server hit on open — the render is
// fully client-side). POST (not GET) because the signed initData must not travel
// in a URL.

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  // Nothing to verify against / nowhere to log -> quietly no-op.
  if (!botToken || !process.env.LOG_CHANNEL_ID) {
    return NextResponse.json({ ok: true });
  }

  const body = (await req.json().catch(() => null)) as { initData?: string } | null;
  if (!body || typeof body.initData !== 'string') {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const verified = verifyInitData(body.initData, botToken);
  if (!verified.ok) return NextResponse.json({ ok: false }, { status: 401 });

  await logUserEvent(botToken, verified.user, 'opened poster/wallpaper generator');
  return NextResponse.json({ ok: true });
}
