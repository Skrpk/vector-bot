import { drawTextScrim } from './scrim';
import type { WallpaperOptions, WallpaperSize } from './types';

/**
 * Popular phone-wallpaper resolutions, covering the aspect ratios of most devices
 * out there (not just iPhones). Full-bleed cover means only the aspect ratio really
 * matters; the pixel dims are common native resolutions and stay mobile-safe.
 */
export const WALLPAPER_SIZES: readonly WallpaperSize[] = [
  { id: '9x16', label: '9:16', w: 1080, h: 1920 }, // classic / many older phones
  { id: '9x20', label: '9:20', w: 1080, h: 2400 }, // most common modern Android
  { id: '9x195', label: '9:19.5', w: 1290, h: 2796 }, // recent iPhone
  { id: '9x21', label: '9:21', w: 1080, h: 2520 }, // extra-tall (Sony / some Android)
] as const;

/** Default wallpaper size when the app loads. */
export const DEFAULT_WALLPAPER_SIZE_ID = '9x195';

export function wallpaperSizeById(id: string): WallpaperSize {
  return WALLPAPER_SIZES.find((s) => s.id === id) ?? WALLPAPER_SIZES[0];
}

/**
 * Wallpaper layout, expressed relative to a 1290px reference width so it scales to
 * any resolution. The wallpaper uses the **same dark sky + stars + constellation
 * lines as the poster** with **white text**, scaled to **cover the whole frame** —
 * the circular projection is enlarged past the frame's diagonal so stars reach
 * every edge and corner.
 */
const LAYOUT = {
  refWidth: 1290,
  placeYRatio: 0.8, // baseline y of the place line (fraction of height)
  placePx: 66,
  datePx: 44,
  watermarkPx: 34,
  dateGap: 64, // place baseline → date baseline
  font: "'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Draw the full-bleed wallpaper (dark sky + stars + white text) onto `canvas` at
 * the size given in `opts`, using the same deep-space background as the poster.
 */
export function composeWallpaper(
  canvas: HTMLCanvasElement,
  opts: WallpaperOptions
): void {
  const { starMapCanvas, place, date, watermark, background, width: W, height: H } = opts;
  const s = W / LAYOUT.refWidth; // scale type with width

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // Dark sky background — the chosen sky colour.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  // Cover the whole frame. The source is a circular sky disc inscribed in a
  // square; to leave no empty corners we scale that square to the frame's
  // diagonal (so the disc's radius ≥ half-diagonal) and centre it.
  const src = Math.min(starMapCanvas.width, starMapCanvas.height);
  const sx = (starMapCanvas.width - src) / 2;
  const sy = (starMapCanvas.height - src) / 2;
  const dest = Math.hypot(W, H);
  const dx = (W - dest) / 2;
  const dy = (H - dest) / 2;
  ctx.drawImage(starMapCanvas, sx, sy, src, src, dx, dy, dest, dest);

  const maxTextWidth = W * 0.86;
  const cx = W / 2;
  const placeY = H * LAYOUT.placeYRatio;
  const dateY = placeY + LAYOUT.dateGap * s;
  const placeFont = `600 ${LAYOUT.placePx * s}px ${LAYOUT.font}`;
  const dateFont = `400 ${LAYOUT.datePx * s}px ${LAYOUT.font}`;

  ctx.textAlign = 'center';

  // Fading dark scrim behind place + date so they don't mix with constellation names.
  if (opts.scrim) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = placeFont;
    const placeW = Math.min(maxTextWidth, ctx.measureText(place).width);
    ctx.font = dateFont;
    const dateW = Math.min(maxTextWidth, ctx.measureText(date).width);
    const top = placeY - LAYOUT.placePx * s;
    const bottom = dateY + LAYOUT.datePx * s * 0.3;
    const halfW = Math.max(placeW, dateW) / 2 + 48 * s;
    const halfH = (bottom - top) / 2 + 34 * s;
    drawTextScrim(ctx, cx, (top + bottom) / 2, halfW, halfH, background);
  }

  // White text with a soft shadow so it stays legible over stars / light screens.
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 18 * s;

  ctx.fillStyle = '#ffffff';
  ctx.font = placeFont;
  ctx.fillText(place, cx, placeY, maxTextWidth);

  ctx.font = dateFont;
  ctx.globalAlpha = 0.85;
  ctx.fillText(date, cx, dateY, maxTextWidth);
  ctx.globalAlpha = 1;

  // Watermark near the bottom.
  // TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
  ctx.font = `500 ${LAYOUT.watermarkPx * s}px ${LAYOUT.font}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText(watermark, cx, H - 96 * s, maxTextWidth);
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;
}
