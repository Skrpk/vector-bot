import crypto from 'node:crypto';

/**
 * Server-side validation of a Telegram Mini App `initData` string.
 *
 * This is the Milestone-2 auth foundation: it proves a request genuinely came
 * from our Mini App (signed by Telegram with our bot token) rather than a forged
 * client, so we can trust the embedded `user.id` as a `chat_id`. Reusable for the
 * rest of Milestone 2 (channel gate, attribution).
 *
 * Algorithm (per Telegram docs):
 *   secret_key       = HMAC_SHA256(key="WebAppData", msg=<bot_token>)
 *   data_check_string = "key=value" for every field except `hash`,
 *                       sorted by key, joined with "\n"
 *   expected_hash    = HMAC_SHA256(key=secret_key, msg=data_check_string)
 * Valid iff expected_hash === the `hash` field.
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type VerifyResult =
  { ok: true; user: TelegramUser; authDate: number } | { ok: false; reason: string };

/** Reject init data older than this — a cheap replay guard. */
const MAX_AGE_SECONDS = 60 * 60; // 1h

export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = MAX_AGE_SECONDS
): VerifyResult {
  if (!initData) return { ok: false, reason: 'empty initData' };
  if (!botToken) return { ok: false, reason: 'missing bot token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no hash' };

  // Build the data-check-string from every field except `hash`, sorted by key.
  const entries: string[] = [];
  for (const [key, value] of params) {
    if (key === 'hash') continue;
    entries.push(`${key}=${value}`);
  }
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Constant-time comparison to avoid leaking the hash via timing.
  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad hash' };
  }

  // Freshness — reject stale (replayed) init data.
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Number.isNaN(authDate)) {
    return { ok: false, reason: 'no auth_date' };
  }
  const ageSeconds = Date.now() / 1000 - authDate;
  if (ageSeconds > maxAgeSeconds) {
    return { ok: false, reason: 'stale auth_date' };
  }

  // Parse the user object (URL-decoded JSON).
  const userRaw = params.get('user');
  if (!userRaw) return { ok: false, reason: 'no user' };
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, reason: 'bad user json' };
  }
  if (typeof user.id !== 'number') return { ok: false, reason: 'no user id' };

  return { ok: true, user, authDate };
}
