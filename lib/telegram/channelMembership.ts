// Channel-subscription gate: before the bot sends the image, confirm the user
// is subscribed to our channel (the Mini App is a lead-magnet for it). Requires
// the bot to be an admin of the channel so `getChatMember` is allowed.
//
// `TELEGRAM_CHANNEL_ID`  — the channel `getChatMember` checks against; either a
//                          public `@username` or a numeric `-100…` id.
// `TELEGRAM_CHANNEL_URL` — the public https://t.me/… link shown to the user when
//                          they aren't subscribed (derived from an `@username`
//                          channel id if unset).

export type MembershipResult =
  | { gated: false } // no channel configured — gate disabled
  | { subscribed: true }
  | { subscribed: false; channelUrl: string }
  | { error: string }; // check failed (e.g. bot not admin) — caller decides

/** Statuses that count as "in the channel". `left`/`kicked` do not. */
const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

function channelUrlFrom(channelId: string): string {
  const explicit = process.env.TELEGRAM_CHANNEL_URL;
  if (explicit) return explicit;
  // Derive from a public @username; numeric ids can't be turned into a link.
  if (channelId.startsWith('@')) return `https://t.me/${channelId.slice(1)}`;
  return '';
}

export async function checkChannelMembership(
  botToken: string,
  userId: number
): Promise<MembershipResult> {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) return { gated: false };

  const url =
    `https://api.telegram.org/bot${botToken}/getChatMember` +
    `?chat_id=${encodeURIComponent(channelId)}&user_id=${userId}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { error: 'could not reach Telegram (getChatMember)' };
  }

  const data = (await res.json().catch(() => null)) as {
    ok: boolean;
    description?: string;
    result?: { status?: string; is_member?: boolean };
  } | null;

  if (!data?.ok) {
    // "user not found" / PARTICIPANT_ID_INVALID means the user simply isn't a
    // member. NB: "chat not found" is different — that's a misconfigured gate
    // (wrong channel id, or the bot isn't an admin) and falls through to error.
    const description = data?.description ?? '';
    if (/user not found|PARTICIPANT_ID_INVALID/i.test(description)) {
      return { subscribed: false, channelUrl: channelUrlFrom(channelId) };
    }
    return { error: description || 'getChatMember failed' };
  }

  const status = data.result?.status ?? '';
  // `restricted` members are only in the channel while `is_member` is true.
  const isMember =
    MEMBER_STATUSES.has(status) &&
    (status !== 'restricted' || data.result?.is_member === true);

  return isMember
    ? { subscribed: true }
    : { subscribed: false, channelUrl: channelUrlFrom(channelId) };
}
