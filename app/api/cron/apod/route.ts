import { NextResponse } from 'next/server';
import { fetchApod } from '@/lib/nasa/apod';
import { translateApodToUk } from '@/lib/openai/translateApod';
import { sendApodPost, type MediaCache } from '@/lib/telegram/sendApod';
import { callBot } from '@/lib/telegram/botApi';
import { checkChannelMembership } from '@/lib/telegram/channelMembership';
import {
  claimApodBroadcast,
  getApodPostByDate,
  getApodSubscriberIds,
  saveApodPost,
  setApodSubscription,
} from '@/lib/db/queries';

// Daily NASA APOD broadcast. Triggered by Vercel Cron (see vercel.json). Fetches
// today's APOD, caches it (so late subscribers get it immediately), then sends
// it to every subscriber. The render path stays client-side; this is a
// server-only scheduled job.

export const runtime = 'nodejs';
// Give the broadcast loop room (Vercel caps this per plan).
export const maxDuration = 300;

// Telegram allows ~30 messages/sec across users; a small gap keeps us safe.
const SEND_GAP_MS = 40;
// Errors that mean the user can't be reached again — prune their subscription.
const DEAD_CHAT =
  /bot was blocked|chat not found|user is deactivated|bot can't initiate/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nudge a subscriber who has left the channel to rejoin (in place of the post). */
async function sendChannelReminder(botToken: string, chatId: number, channelUrl: string) {
  return callBot(botToken, 'sendMessage', {
    chat_id: chatId,
    text:
      '👋 Ми помітили, що ви більше не підписані на наш канал.\n\n' +
      'Щоб продовжувати отримувати щоденні фото NASA, підпишіться на канал знову 👇',
    ...(channelUrl
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: '📢 Перейти на канал', url: channelUrl }]],
          },
        }
      : {}),
  });
}

export async function GET(req: Request) {
  // Auth: when CRON_SECRET is set, require it (Vercel Cron sends it as a Bearer
  // token). Unset -> allow, so the job can be triggered locally for testing.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  // Fire only at noon Kyiv time. Vercel Cron is UTC-only and can't follow DST, so
  // the job is scheduled at both 09:00 and 10:00 UTC and we gate on the real Kyiv
  // hour here — exactly one of the two lands on 12:00 Kyiv year-round (EET/EEST).
  // `?force=1` bypasses the gate for manual testing.
  const force = new URL(req.url).searchParams.get('force') === '1';
  const kyivHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  );
  if (!force && kyivHour !== 12) {
    return NextResponse.json({
      ok: true,
      skipped: `not noon in Kyiv (hour ${kyivHour})`,
    });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: 'no bot token' }, { status: 500 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'no database' }, { status: 500 });
  }

  // 1. Fetch + cache today's APOD.
  const apod = await fetchApod();
  if (!apod) {
    return NextResponse.json({ ok: false, error: 'nasa fetch failed' }, { status: 502 });
  }
  // Rewrite the description into Ukrainian (OpenAI). Best-effort — null on
  // failure, and the sender falls back to the English original.
  const explanationUk = await translateApodToUk(apod.title, apod.explanation);
  await saveApodPost({
    apodDate: apod.date,
    title: apod.title,
    explanation: apod.explanation,
    explanationUk,
    mediaType: apod.mediaType,
    url: apod.url,
    hdurl: apod.hdurl,
    thumbnailUrl: apod.thumbnailUrl,
    copyright: apod.copyright,
  });

  // 2. Claim the broadcast — bail if a prior run already sent this date.
  const claimed = await claimApodBroadcast(apod.date);
  if (!claimed) {
    return NextResponse.json({ ok: true, date: apod.date, skipped: 'already broadcast' });
  }

  const post = await getApodPostByDate(apod.date);
  if (!post) {
    return NextResponse.json(
      { ok: false, error: 'post not found after save' },
      { status: 500 }
    );
  }

  // 3. Broadcast to every subscriber. A shared media cache means a big video is
  // uploaded once and re-sent to everyone else by file_id (no per-user re-upload).
  const subscribers = await getApodSubscriberIds();
  const cache: MediaCache = {};
  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let reminded = 0;
  for (const chatId of subscribers) {
    // Re-check channel membership at send time: a subscriber may have left the
    // channel since subscribing. Non-members get a "rejoin" nudge instead of the
    // post (they stay subscribed, so posts resume once they rejoin). A gate error
    // or no-channel config falls through to sending, matching the other gates.
    const membership = await checkChannelMembership(botToken, chatId);
    if ('subscribed' in membership && membership.subscribed === false) {
      await sendChannelReminder(botToken, chatId, membership.channelUrl).catch(() => {});
      reminded++;
      if (SEND_GAP_MS) await sleep(SEND_GAP_MS);
      continue;
    }

    const result = await sendApodPost(botToken, chatId, post, cache);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (result.description && DEAD_CHAT.test(result.description)) {
        await setApodSubscription(chatId, false).catch(() => {});
        pruned++;
      }
    }
    if (SEND_GAP_MS) await sleep(SEND_GAP_MS);
  }

  return NextResponse.json({
    ok: true,
    date: apod.date,
    subscribers: subscribers.length,
    sent,
    failed,
    pruned,
    reminded,
  });
}
