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

    return { isTelegram, theme, startParam };
  } catch {
    // Any SDK failure -> behave like a plain browser.
    applyThemeToDocument(fallback.theme);
    return fallback;
  }
}
