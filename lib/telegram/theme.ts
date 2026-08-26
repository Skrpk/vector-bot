import type { Theme } from '@/lib/sky/types';

/**
 * Telegram WebApp theme params (subset we use). All optional — outside Telegram
 * none of these are present and we fall back to the default dark theme.
 * @see https://core.telegram.org/bots/webapps#themeparams
 */
export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  accent_text_color?: string;
}

/** Our house default when there is no Telegram context (local dev / plain browser). */
export const DEFAULT_THEME: Theme = {
  mode: 'dark',
  background: '#0a0e1a',
  text: '#f2f4ff',
  muted: '#8891b0',
  accent: '#6ea8ff',
};

function isLight(hex?: string): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 601 luma.
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/**
 * Map Telegram theme params onto our Theme. Missing fields fall back to the
 * default dark theme so the poster always renders on a legible dark sky, while
 * still honouring Telegram's background/text/accent when provided.
 */
export function themeFromTelegram(params?: TelegramThemeParams): Theme {
  if (!params || Object.keys(params).length === 0) return DEFAULT_THEME;
  const background = params.bg_color ?? DEFAULT_THEME.background;
  return {
    mode: isLight(background) ? 'light' : 'dark',
    background,
    text: params.text_color ?? DEFAULT_THEME.text,
    muted: params.hint_color ?? DEFAULT_THEME.muted,
    accent:
      params.button_color ??
      params.accent_text_color ??
      params.link_color ??
      DEFAULT_THEME.accent,
  };
}

/** Push theme colours onto CSS custom properties so the page chrome matches. */
export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const s = document.documentElement.style;
  s.setProperty('--bg', theme.background);
  s.setProperty('--text', theme.text);
  s.setProperty('--muted', theme.muted);
  s.setProperty('--accent', theme.accent);
  document.documentElement.dataset.theme = theme.mode;
}
