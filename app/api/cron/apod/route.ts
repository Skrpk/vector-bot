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
  releaseApodBroadcast,
  saveApodPost,
  setBlocked,
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
// Errors meaning the user is unreachable — mark them blocked (broadcast skips
// them). They stay subscribed; interacting with the bot clears the flag.
const BLOCKED_ERR =
  /bot was blocked|user is deactivated|chat not found|bot can't initiate/i;

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
  const params = new URL(req.url).searchParams;
  const force = params.get('force') === '1';
  // `?dry=1` inspects the broadcast WITHOUT sending anything and without taking
  // the claim: who would receive today's post, and who the channel gate would
  // turn away. The only way to see that after the fact, since the real run hands
  // its summary to Vercel Cron, which discards it.
  const dry = params.get('dry') === '1';
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

  if (dry) {
    let ids: number[];
    try {
      ids = await getApodSubscriberIds();
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `subscriber lookup failed: ${String(err)}` },
        { status: 500 }
      );
    }
    const members: number[] = [];
    const notMembers: number[] = [];
    const gateErrors: string[] = [];
    for (const chatId of ids) {
      const m = await checkChannelMembership(botToken, chatId);
      if ('error' in m) gateErrors.push(`${chatId}: ${m.error}`);
      else if ('subscribed' in m && m.subscribed === false) notMembers.push(chatId);
      else members.push(chatId);
    }
    return NextResponse.json({
      ok: true,
      dry: true,
      date: apod.date,
      source: apod.source,
      title: apod.title,
      translated: Boolean(explanationUk),
      mediaType: apod.mediaType,
      mediaUrl: apod.url,
      alreadyBroadcast: Boolean((await getApodPostByDate(apod.date))?.broadcastAt),
      subscribers: ids.length,
      wouldReceivePost: members.length,
      wouldGetRejoinNudge: notMembers.length,
      gateErrors,
    });
  }

  // 2. Claim the broadcast — bail if a prior run already sent this date.
  const claimed = await claimApodBroadcast(apod.date);
  if (!claimed) {
    return NextResponse.json({
      ok: true,
      date: apod.date,
      source: apod.source,
      skipped: 'already broadcast',
    });
  }

  const post = await getApodPostByDate(apod.date);
  if (!post) {
    await releaseApodBroadcast(apod.date).catch(() => {});
    return NextResponse.json(
      { ok: false, error: 'post not found after save' },
      { status: 500 }
    );
  }

  // 3. Broadcast to every subscriber. A shared media cache means a big video is
  // uploaded once and re-sent to everyone else by file_id (no per-user re-upload).
  let subscribers: number[];
  try {
    subscribers = await getApodSubscriberIds();
  } catch (err) {
    // Typically a schema drift (an unapplied migration). The claim is already
    // taken at this point, so hand it back — otherwise this date is marked
    // broadcast forever and today's photo can never be sent.
    await releaseApodBroadcast(apod.date).catch(() => {});
    console.error('[cron/apod] could not load subscribers:', err);
    return NextResponse.json(
      { ok: false, date: apod.date, error: `subscriber lookup failed: ${String(err)}` },
      { status: 500 }
    );
  }

  const cache: MediaCache = {};
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let reminded = 0;
  for (const chatId of subscribers) {
    // Re-check channel membership at send time: a subscriber may have left the
    // channel since subscribing. Non-members get a "rejoin" nudge instead of the
    // post (they stay subscribed, so posts resume once they rejoin). A gate error
    // or no-channel config falls through to sending, matching the other gates.
    const membership = await checkChannelMembership(botToken, chatId);
    if ('subscribed' in membership && membership.subscribed === false) {
      const rem = await sendChannelReminder(
        botToken,
        chatId,
        membership.channelUrl
      ).catch(() => null);
      if (rem && !rem.ok && rem.description && BLOCKED_ERR.test(rem.description)) {
        await setBlocked(chatId, true).catch(() => {});
        blocked++;
      } else {
        reminded++;
      }
      if (SEND_GAP_MS) await sleep(SEND_GAP_MS);
      continue;
    }

    const result = await sendApodPost(botToken, chatId, post, cache);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      console.error(`[cron/apod] send to ${chatId} failed:`, result.description);
      if (result.description && BLOCKED_ERR.test(result.description)) {
        // Blocked/deactivated — skip them going forward (they stay subscribed;
        // interacting with the bot clears `blocked` via upsertUser).
        await setBlocked(chatId, true).catch(() => {});
        blocked++;
      }
    }
    if (SEND_GAP_MS) await sleep(SEND_GAP_MS);
  }

  // A run that reached NOBODY did not happen: hand the claim back so the next
  // run (or a manual trigger) can retry the day. Only when every single send
  // errored — zero subscribers, or a list that all legitimately got the rejoin
  // nudge, are real outcomes and must not loop.
  const reachedNobody = subscribers.length > 0 && sent === 0 && reminded === 0;
  if (reachedNobody) {
    await releaseApodBroadcast(apod.date).catch(() => {});
    console.error(`[cron/apod] ${apod.date}: reached nobody, claim released for retry`);
  }

  // Vercel Cron throws the response away, so the summary has to reach the logs
  // too — otherwise a day where nobody received anything leaves no trace.
  console.log(
    `[cron/apod] ${apod.date} via ${apod.source}` +
      `${explanationUk ? '' : ' (NOT translated, English fallback)'}: ` +
      `${subscribers.length} subscribers, ` +
      `sent ${sent}, failed ${failed}, blocked ${blocked}, reminded ${reminded}`
  );

  return NextResponse.json({
    ok: true,
    date: apod.date,
    // 'api' = api.nasa.gov answered; 'site' = we fell back to science.nasa.gov.
    source: apod.source,
    title: apod.title,
    // false = OpenAI didn't answer (bad key, quota, model) and the post went out
    // in English. The send still succeeds, so it's otherwise invisible.
    translated: Boolean(explanationUk),
    subscribers: subscribers.length,
    sent,
    failed,
    blocked,
    reminded,
    ...(reachedNobody ? { retryable: true } : {}),
  });
}
