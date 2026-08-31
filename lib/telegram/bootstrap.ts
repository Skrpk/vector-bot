import type { Theme } from '@/lib/sky/types';
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  themeFromTelegram,
  type TelegramThemeParams,
} from './theme';

export interface TelegramContext {
  /** True when running inside a real Telegram WebApp. */
  isTelegram: boolean;
  theme: Theme;
  /**
   * Deep-link payload from `?startapp=` / `start_param`. Read-only here.
   * TODO(milestone-2): use this as the attribution key (who shared the link).
   */
  startParam: string | null;
  /**
   * Raw signed `initData` query string. Sent to the server (never trusted
   * client-side) so it can validate the HMAC and derive the user's chat_id —
   * see `send-to-chat`. Empty string outside Telegram.
   */
  initData: string;
}

/**
 * Bootstrap the Telegram Mini App SDK.
 *
 * Runs client-side only. `@twa-dev/sdk` vendors Telegram's telegram-web-app.js,
 * so importing it also populates `window.Telegram.WebApp` — inside Telegram that
 * carries real theme/init data; in a plain browser it degrades to a stub with
 * `platform === 'unknown'` and empty theme params. Either way the app stays
 * usable: we apply the Telegram theme when present, else the default dark theme.
 *
 * No `initData` HMAC validation here — that is server-side and Milestone 2.
 */
export async function initTelegram(): Promise<TelegramContext> {
  const fallback: TelegramContext = {
    isTelegram: false,
    theme: DEFAULT_THEME,
    startParam: null,
    initData: '',
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const WebApp = (await import('@twa-dev/sdk')).default;
    WebApp.ready();
    WebApp.expand();

    const platform = WebApp.platform;
    const isTelegram = Boolean(platform && platform !== 'unknown');

    const theme = isTelegram
      ? themeFromTelegram(WebApp.themeParams as unknown as TelegramThemeParams)
      : DEFAULT_THEME;
    applyThemeToDocument(theme);

    // TODO(milestone-2): validate initData server-side, then use start_param
    // for attribution logging. For now we only read it.
    const startParam = WebApp.initDataUnsafe?.start_param ?? null;
    // Raw signed string — validated server-side before we trust it.
    const initData = WebApp.initData ?? '';

    return { isTelegram, theme, startParam, initData };
  } catch {
    // Any SDK failure -> behave like a plain browser.
    applyThemeToDocument(fallback.theme);
    return fallback;
  }
}

/**
 * Open a Telegram deep link (e.g. a channel) from inside the Mini App. Uses the
 * SDK's `openTelegramLink` when in Telegram (keeps the user in the app), else a
 * plain new-tab navigation.
 */
export async function openTelegramLink(url: string): Promise<void> {
  if (!url || typeof window === 'undefined') return;
  try {
    const WebApp = (await import('@twa-dev/sdk')).default;
    if (WebApp.platform && WebApp.platform !== 'unknown') {
      WebApp.openTelegramLink(url);
      return;
    }
  } catch {
    // fall through to a plain navigation
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
