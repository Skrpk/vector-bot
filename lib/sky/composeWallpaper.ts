import { SKY_BACKGROUND } from './celestial-config';
import type { WallpaperOptions } from './types';

/**
 * Wallpaper layout — a tall iPhone-friendly frame (≈9:19.5). All geometry/
 * typography lives here so it's easy to restyle in one place.
 *
 * The wallpaper uses the **same dark sky + stars + constellation lines as the
 * poster** with **white text**, scaled to **cover the whole frame** — the circular
 * projection is enlarged past the frame's diagonal so stars reach every edge and
 * corner.
 */
export const WALLPAPER = {
  width: 1290,
  height: 2796, // iPhone 16 Pro Max pixels; iOS scales down on smaller devices
  /** Baseline y (fraction of height) of the place line. */
  placeYRatio: 0.8,
  placeFont: "600 66px 'Helvetica Neue', Arial, sans-serif",
  dateFont: "400 44px 'Helvetica Neue', Arial, sans-serif",
  watermarkFont: "500 34px 'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Draw the wallpaper (full-bleed dark sky + stars + white text) onto `canvas`,
 * using the same deep-space background as the poster.
 */
export function composeWallpaper(
  canvas: HTMLCanvasElement,
  opts: WallpaperOptions
): void {
  const { starMapCanvas, place, date, watermark } = opts;
  const { width: W, height: H } = WALLPAPER;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // Dark sky background — same colour as the poster's sky.
  ctx.fillStyle = SKY_BACKGROUND;
  ctx.fillRect(0, 0, W, H);

  // Cover the whole frame. The source is a circular sky disc inscribed in a
  // square; to leave no empty corners we scale that square to the frame's
  // diagonal (so the disc's radius ≥ half-diagonal) and centre it.
  const S = Math.min(starMapCanvas.width, starMapCanvas.height);
  const sx = (starMapCanvas.width - S) / 2;
  const sy = (starMapCanvas.height - S) / 2;
  const dest = Math.hypot(W, H);
  const dx = (W - dest) / 2;
  const dy = (H - dest) / 2;
  ctx.drawImage(starMapCanvas, sx, sy, S, S, dx, dy, dest, dest);

  // White text with a soft shadow so it stays legible over stars / light screens.
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 18;
  const maxTextWidth = W * 0.86;
  const cx = W / 2;

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = WALLPAPER.placeFont;
  ctx.fillText(place, cx, H * WALLPAPER.placeYRatio, maxTextWidth);

  ctx.font = WALLPAPER.dateFont;
  ctx.globalAlpha = 0.85;
  ctx.fillText(date, cx, H * WALLPAPER.placeYRatio + 64, maxTextWidth);
  ctx.globalAlpha = 1;

  // Watermark near the bottom.
  // TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
  ctx.font = WALLPAPER.watermarkFont;
  ctx.globalAlpha = 0.7;
  ctx.fillText(watermark, cx, H - 96, maxTextWidth);
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;
}
