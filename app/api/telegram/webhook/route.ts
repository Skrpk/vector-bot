import { NextResponse } from 'next/server';
import { callBot } from '@/lib/telegram/botApi';
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

const SUB = 'apod_sub';
const UNSUB = 'apod_unsub';

interface InlineButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
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

const nasaButton = (subscribed: boolean): InlineButton =>
  subscribed
    ? { text: '❌ Відписатися від фото NASA', callback_data: UNSUB }
    : { text: '🔭 Підписатися на щоденне фото NASA', callback_data: SUB };

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
        // /start — welcome with both buttons.
        const subscribed = hasDb
          ? await isApodSubscribed(msg.from.id).catch(() => false)
          : false;
        await callBot(botToken, 'sendMessage', {
          chat_id: chatId,
          text:
            'Вітаю! 🌌\n\nЦей бот створює персональну карту зоряного неба на будь-яку ' +
            'дату й місце — ідеально для подарунка чи спогаду.\n\n' +
            '• /maps — згенерувати карту\n• /nasa — щоденне фото NASA',
          reply_markup: {
            inline_keyboard: [[mapsButton(webAppUrl)], [nasaButton(subscribed)]],
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // --- Inline-button taps (NASA subscribe / unsubscribe) ---------------------
    const cq = update.callback_query;
    if (cq && (cq.data === SUB || cq.data === UNSUB)) {
      const subscribe = cq.data === SUB;

      if (!hasDb) {
        await callBot(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: 'Сервіс тимчасово недоступний.',
        });
        return NextResponse.json({ ok: true });
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
          ? existing.map((row) =>
              row.map((btn) =>
                btn.callback_data === SUB || btn.callback_data === UNSUB
                  ? nasaButton(subscribe)
                  : btn
              )
            )
          : [[nasaButton(subscribe)]];
        await callBot(botToken, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: rebuilt },
        }).catch(() => {});
      }

      // On subscribe, send today's cached photo immediately (if the broadcast ran).
      if (subscribe) {
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
