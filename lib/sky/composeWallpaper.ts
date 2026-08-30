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
 * Wallpaper layout, relative to a 1290px reference width so it scales to any
 * resolution. Full-bleed sky + white text (title / place / date) sitting over a
 * near-opaque dark scrim that fades at its edges, so the text never mixes with the
 * constellation names/art behind it.
 */
const LAYOUT = {
  refWidth: 1290,
  blockCenterYRatio: 0.8, // vertical centre of the title/place/date block
  titlePx: 58,
  placePx: 46,
  datePx: 36,
  lineGap: 18,
  watermarkPx: 34,
  font: "'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Draw the full-bleed wallpaper (dark sky + stars + white text) onto `canvas` at
 * the size given in `opts`, using the same sky background colour as the poster.
 */
export function composeWallpaper(
  canvas: HTMLCanvasElement,
  opts: WallpaperOptions
): void {
  const {
    starMapCanvas,
    title,
    place,
    date,
    watermark,
    background,
    width: W,
    height: H,
  } = opts;
  const s = W / LAYOUT.refWidth;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // Sky background — the chosen colour.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  // Cover the whole frame. The source is a circular sky disc inscribed in a
  // square; to leave no empty corners we scale that square to the frame's
  // diagonal (so the disc's radius ≥ half-diagonal) and centre it.
  const src = Math.min(starMapCanvas.width, starMapCanvas.height);
  const sx = (starMapCanvas.width - src) / 2;
  const sy = (starMapCanvas.height - src) / 2;
  const dest = Math.hypot(W, H);
  ctx.drawImage(
    starMapCanvas,
    sx,
    sy,
    src,
    src,
    (W - dest) / 2,
    (H - dest) / 2,
    dest,
    dest
  );

  const cx = W / 2;
  const maxTextWidth = W * 0.86;

  // Text lines (title optional), top → bottom.
  const lines: { text: string; px: number; weight: number; alpha: number }[] = [];
  if (title) lines.push({ text: title, px: LAYOUT.titlePx, weight: 600, alpha: 1 });
  lines.push({ text: place, px: LAYOUT.placePx, weight: 600, alpha: 1 });
  lines.push({ text: date, px: LAYOUT.datePx, weight: 400, alpha: 0.9 });

  const gap = LAYOUT.lineGap * s;
  const totalH =
    lines.reduce((h, l) => h + l.px * s, 0) + gap * Math.max(0, lines.length - 1);
  const blockTop = H * LAYOUT.blockCenterYRatio - totalH / 2;

  const fontFor = (l: { px: number; weight: number }) =>
    `${l.weight} ${l.px * s}px ${LAYOUT.font}`;

  // Widest line, for the scrim size.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let maxLineW = 0;
  for (const l of lines) {
    ctx.font = fontFor(l);
    maxLineW = Math.max(maxLineW, Math.min(maxTextWidth, ctx.measureText(l.text).width));
  }

  // Near-opaque dark scrim behind the whole block (fades to transparent at edges).
  drawTextScrim(
    ctx,
    cx,
    blockTop + totalH / 2,
    maxLineW / 2 + 60 * s,
    totalH / 2 + 48 * s,
    background,
    0.9
  );

  // Text (white, subtle shadow for the fade edge).
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 12 * s;
  ctx.fillStyle = '#ffffff';
  let y = blockTop;
  for (const l of lines) {
    ctx.font = fontFor(l);
    ctx.globalAlpha = l.alpha;
    ctx.fillText(l.text, cx, y, maxTextWidth);
    y += l.px * s + gap;
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Watermark near the bottom, on its own small scrim.
  // TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
  const wmFont = `500 ${LAYOUT.watermarkPx * s}px ${LAYOUT.font}`;
  ctx.font = wmFont;
  const wmW = Math.min(maxTextWidth, ctx.measureText(watermark).width);
  const wmY = H - 96 * s;
  drawTextScrim(
    ctx,
    cx,
    wmY - LAYOUT.watermarkPx * s * 0.35,
    wmW / 2 + 40 * s,
    LAYOUT.watermarkPx * s * 0.9 + 20 * s,
    background,
    0.85
  );
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.75;
  ctx.fillText(watermark, cx, wmY, maxTextWidth);
  ctx.globalAlpha = 1;
}
