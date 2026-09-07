import { callBot, escapeHtml } from './botApi';
import type { TelegramUser } from './verifyInitData';

// Audit log: mirrors user actions into a private Telegram channel so you can
// watch usage live. Entirely best-effort — a failure here must never break the
// user-facing flow. Disabled when LOG_CHANNEL_ID is unset.
//
// LOG_CHANNEL_ID: numeric `-100…` id (or `@username`) of the log channel. The bot
// must be an ADMIN of it with permission to post messages.

/** "@username" when available, else the user's full name. */
function displayName(user: TelegramUser): string {
  if (user.username) return `@${user.username}`;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || '—';
}

/**
 * Post one line to the log channel: `User <id> <name> <action>`.
 * Never throws and never rejects.
 */
export async function logUserEvent(
  botToken: string | undefined,
  user: TelegramUser,
  action: string
): Promise<void> {
  const chatId = process.env.LOG_CHANNEL_ID;
  if (!chatId || !botToken) return;
  try {
    await callBot(botToken, 'sendMessage', {
      chat_id: chatId,
      text: `User <code>${user.id}</code> ${escapeHtml(displayName(user))} ${escapeHtml(action)}`,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch {
    /* logging must never break the caller */
  }
}
