import { NextResponse } from 'next/server';
import {
  APOD_SUB,
  APOD_SUB_POST,
  APOD_UNSUB,
  APOD_UNSUB_POST,
  callBot,
} from '@/lib/telegram/botApi';
import { checkChannelMembership } from '@/lib/telegram/channelMembership';
import { sendApodPost } from '@/lib/telegram/sendApod';
import {
  getFreshApodPost,
  isApodSubscribed,
  setApodSubscription,
  upsertUser,
} from '@/lib/db/queries';
import type { TelegramUser } from '@/lib/telegram/verifyInitData';

// Telegram bot webhook. Drives the bot conversation via commands:
//   /start — welcome + both buttons
//   /maps  — a web_app button that opens the Mini App
//   /nasa  — a subscribe/unsubscribe button (reflects current state)
// and the inline-button taps behind the NASA subscription. Register it with
// setWebhook (see README).

export const runtime = 'nodejs';

// Callbacks: the plain SUB/UNSUB come from /start and /nasa (subscribe there sends
// today's photo immediately); the *_POST variants come from the button on a daily
// post (re-subscribing there is silent — they already have that post).
const SUBSCRIBE = new Set<string>([APOD_SUB, APOD_SUB_POST]);
const UNSUBSCRIBE = new Set<string>([APOD_UNSUB, APOD_UNSUB_POST]);
const POST_CTX = new Set<string>([APOD_SUB_POST, APOD_UNSUB_POST]);

interface InlineButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
  url?: string;
}
type InlineKeyboard = InlineButton[][];

interface TgUpdate {
  message?: { chat?: { id?: number }; from?: TelegramUser; text?: string };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: {
      chat?: { id?: number };
      message_id?: number;
      reply_markup?: { inline_keyboard?: InlineKeyboard };
    };
    data?: string;
  };
}

const mapsButton = (webAppUrl: string): InlineButton => ({
  text: '🌌 Відкрити конструктор карти',
  web_app: { url: webAppUrl },
});

// /start & /nasa button (with emoji). `subscribed` = current state.
const nasaButton = (subscribed: boolean): InlineButton =>
  subscribed
    ? { text: '❌ Відписатися від фото NASA', callback_data: APOD_UNSUB }
    : { text: '🔭 Підписатися на щоденне фото NASA', callback_data: APOD_SUB };

// The plain button attached to a daily post (its _POST callbacks keep re-subscribe
// silent). Flipped in place when tapped.
const postButton = (subscribed: boolean): InlineButton =>
  subscribed
    ? { text: 'Відписатися', callback_data: APOD_UNSUB_POST }
    : { text: 'Підписатися', callback_data: APOD_SUB_POST };

/** Toggle a subscribe/unsubscribe button to the new state, keeping its family. */
function toggleButton(btn: InlineButton, subscribed: boolean): InlineButton {
  if (btn.callback_data && POST_CTX.has(btn.callback_data)) return postButton(subscribed);
  if (btn.callback_data === APOD_SUB || btn.callback_data === APOD_UNSUB) {
    return nasaButton(subscribed);
  }
  return btn;
}

export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
  if (!botToken || !webAppUrl) {
    // Nothing we can do; ack so Telegram doesn't retry forever.
    return NextResponse.json({ ok: true });
  }

  // Verify the request really came from Telegram (secret set at setWebhook time).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });
  const hasDb = Boolean(process.env.DATABASE_URL);

  try {
    // --- Commands --------------------------------------------------------------
    const msg = update.message;
    // Command text may carry a bot suffix (/nasa@MyBot) or args; match the verb.
    const cmd = msg?.text?.match(/^\/(start|maps|nasa)\b/)?.[1];
    if (cmd && msg?.chat?.id && msg.from) {
      const chatId = msg.chat.id;
      if (hasDb) await upsertUser(msg.from).catch(() => {});

      if (cmd === 'maps') {
        await callBot(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Натисніть, щоб відкрити конструктор зоряної карти 👇',
          reply_markup: { inline_keyboard: [[mapsButton(webAppUrl)]] },
        });
      } else if (cmd === 'nasa') {
        const subscribed = hasDb
          ? await isApodSubscribed(msg.from.id).catch(() => false)
          : false;
        await callBot(botToken, 'sendMessage', {
          chat_id: chatId,
          text: subscribed
            ? 'Ви підписані на щоденне астрономічне фото NASA (щодня о 12:00).'
            : 'Підпишіться на щоденне астрономічне фото дня від NASA — щодня о 12:00 у ваш чат.',
          reply_markup: { inline_keyboard: [[nasaButton(subscribed)]] },
        });
      } else {
        // /start — two preview images (what you can make) + welcome + both buttons.
        const subscribed = hasDb
          ? await isApodSubscribed(msg.from.id).catch(() => false)
          : false;
        const base = webAppUrl.replace(/\/$/, '');
        // Preview album — best-effort (skipped/ignored if the images can't load).
        await callBot(botToken, 'sendMediaGroup', {
          chat_id: chatId,
          media: [
            { type: 'photo', media: `${base}/star-map.png` },
            { type: 'photo', media: `${base}/star-wallpaper.png` },
          ],
        }).catch(() => {});
        await callBot(botToken, 'sendMessage', {
          chat_id: chatId,
          text:
            'Вітаю! 🌌\n\nЦей бот створює персональну карту зоряного неба на будь-яку ' +
            'дату й місце — ідеально для подарунка чи спогаду (постер або шпалери на телефон).\n\n' +
            '🌌 /maps — згенерувати свою зоряну карту.\n' +
            '🔭 /nasa — «Астрономічне фото дня» від NASA: щодня о 12:00 надсилаємо ' +
            'фото чи відео космосу з коротким описом українською.',
          reply_markup: {
            inline_keyboard: [[mapsButton(webAppUrl)], [nasaButton(subscribed)]],
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // --- Inline-button taps (NASA subscribe / unsubscribe) ---------------------
    const cq = update.callback_query;
    if (cq && cq.data && (SUBSCRIBE.has(cq.data) || UNSUBSCRIBE.has(cq.data))) {
      const subscribe = SUBSCRIBE.has(cq.data);
      // Tapped on a daily post? Then a re-subscribe is SILENT (no immediate send).
      const fromPost = POST_CTX.has(cq.data);

      if (!hasDb) {
        await callBot(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'Сервіс тимчасово недоступний.',
        });
        return NextResponse.json({ ok: true });
      }

      // Subscribing requires channel membership (same gate as the star generator).
      // Not a member -> prompt to join the channel first, then retry. A gate error
      // (e.g. bot not admin) fails open, matching /api/send-to-chat.
      if (subscribe) {
        const membership = await checkChannelMembership(botToken, cq.from.id);
        if ('error' in membership) {
          console.error('[webhook] membership check failed:', membership.error);
        } else if ('subscribed' in membership && membership.subscribed === false) {
          await callBot(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: 'Спершу підпишіться на канал 👇',
          });
          const keyboard: InlineKeyboard = [];
          if (membership.channelUrl) {
            keyboard.push([{ text: '📢 Перейти на канал', url: membership.channelUrl }]);
          }
          // Retry button stays in the same family (silent if it came from a post).
          keyboard.push([fromPost ? postButton(false) : nasaButton(false)]);
          await callBot(botToken, 'sendMessage', {
            chat_id: cq.message?.chat?.id ?? cq.from.id,
            text:
              'Щоб отримувати щоденне фото NASA, спершу підпишіться на наш канал. ' +
              'Потім натисніть «Підписатися на щоденне фото NASA» ще раз.',
            reply_markup: { inline_keyboard: keyboard },
          });
          return NextResponse.json({ ok: true });
        }
      }

      await upsertUser(cq.from).catch(() => {});
      await setApodSubscription(cq.from.id, subscribe);

      await callBot(botToken, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: subscribe
          ? 'Готово! Надсилатимемо фото щодня о 12:00.'
          : 'Ви відписалися від щоденного фото.',
      });

      // Flip the NASA button in place, preserving any other buttons (e.g. the
      // maps button on a /start message).
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      if (chatId && messageId) {
        const existing = cq.message?.reply_markup?.inline_keyboard;
        const rebuilt: InlineKeyboard = existing
          ? existing.map((row) => row.map((btn) => toggleButton(btn, subscribe)))
          : [[fromPost ? postButton(subscribe) : nasaButton(subscribe)]];
        await callBot(botToken, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: rebuilt },
        }).catch(() => {});
      }

      // On subscribe, send today's cached photo immediately (if the broadcast ran)
      // — but NOT when re-subscribing from a post: the user already has that post.
      if (subscribe && !fromPost) {
        const post = await getFreshApodPost();
        if (post) await sendApodPost(botToken, cq.from.id, post).catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error('[webhook]', err);
  }

  return NextResponse.json({ ok: true });
}
