import { drawTextScrim } from './scrim';
import type { PosterOptions, PosterSize } from './types';

/**
 * Poster print sizes (cm) → export pixel dimensions. Rendered at ~150 DPI with
 * the long edge capped so the canvas stays within mobile-browser limits.
 * TODO(milestone-2): true 300-DPI "HD" export behind the paid tier.
 */
const DPI = 150;
const MAX_LONG_EDGE = 4096; // keep canvas mobile-safe (iOS/Telegram webview)

function sizeFromCm(id: string, wCm: number, hCm: number): PosterSize {
  let w = Math.round((wCm / 2.54) * DPI);
  let h = Math.round((hCm / 2.54) * DPI);
  if (h > MAX_LONG_EDGE) {
    w = Math.round(w * (MAX_LONG_EDGE / h));
    h = MAX_LONG_EDGE;
  }
  return { id, label: `${wCm}×${hCm} cm`, cm: [wCm, hCm], w, h };
}

export const POSTER_SIZES: readonly PosterSize[] = [
  sizeFromCm('21x30', 21, 30),
  sizeFromCm('30x40', 30, 40),
  sizeFromCm('40x50', 40, 50),
  sizeFromCm('50x70', 50, 70),
] as const;

/** Default poster size when the app loads. */
export const DEFAULT_POSTER_SIZE_ID = '21x30';

export function posterSizeById(id: string): PosterSize {
  return POSTER_SIZES.find((s) => s.id === id) ?? POSTER_SIZES[0];
}

/**
 * Poster "paper" — the colour OUTSIDE the sky circle plus the matching text
 * colours. Separate from the sky-disc background (which the shared "Background"
 * control sets). White paper flips the text to dark.
 */
export interface PosterPaper {
  id: string;
  label: string;
  bg: string;
  text: string;
  muted: string;
}
export const POSTER_PAPERS: readonly PosterPaper[] = [
  { id: 'space', label: 'Космос', bg: '#0b1020', text: '#f2f4ff', muted: '#8891b0' },
  { id: 'black', label: 'Чорний', bg: '#000000', text: '#f2f4ff', muted: '#8891b0' },
  { id: 'white', label: 'Білий', bg: '#ffffff', text: '#12131a', muted: '#555b70' },
] as const;
export const DEFAULT_POSTER_PAPER_ID = 'space';
export function posterPaperById(id: string): PosterPaper {
  return POSTER_PAPERS.find((p) => p.id === id) ?? POSTER_PAPERS[0];
}

/**
 * Layout, expressed relative to a 1080px reference width so it scales to any
 * poster size. All geometry/typography lives here to make restyling easy.
 */
const LAYOUT = {
  refWidth: 1080,
  margin: 90,
  /** Sky circle diameter as a fraction of poster width. */
  skyDiameterRatio: 0.82,
  /** Vertical centre of the sky circle as a fraction of poster height. */
  skyCenterYRatio: 0.42,
  ringWidth: 3,
  titlePx: 62,
  subtitlePx: 30,
  watermarkPx: 26,
  titleGap: 96, // circle bottom → title
  subtitleTop: 84, // title top → first subtitle line
  lineGap: 42,
  font: "'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Draw the composed poster (sky + title + subtitle + watermark) onto `canvas` at
 * the size given in `opts` (defaults to 40×50). The star map is clipped into a
 * circle with a thin accent ring; the theme colours the chrome while the sky keeps
 * its own dark background. Layout scales with the poster width.
 */
export function composePoster(canvas: HTMLCanvasElement, opts: PosterOptions): void {
  const {
    starMapCanvas,
    title,
    subtitle,
    watermark,
    theme,
    background,
    textColor,
    mutedColor,
    width,
    height,
  } = opts;
  const s = width / LAYOUT.refWidth; // scale factor vs the reference width
  const margin = LAYOUT.margin * s;
  const maxTextWidth = width - margin * 2;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // Paper (colour outside the sky circle). The disc keeps its own sky colour.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // Sky circle geometry
  const diameter = width * LAYOUT.skyDiameterRatio;
  const radius = diameter / 2;
  const cx = width / 2;
  const cy = height * LAYOUT.skyCenterYRatio;

  // Clip the (square) star map into the circle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const src = Math.min(starMapCanvas.width, starMapCanvas.height);
  const sx = (starMapCanvas.width - src) / 2;
  const sy = (starMapCanvas.height - src) / 2;
  ctx.drawImage(
    starMapCanvas,
    sx,
    sy,
    src,
    src,
    cx - radius,
    cy - radius,
    diameter,
    diameter
  );
  ctx.restore();

  // Accent ring around the sky
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = LAYOUT.ringWidth * s;
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Text block geometry
  const textTop = cy + radius + LAYOUT.titleGap * s;
  const titleFont = `600 ${LAYOUT.titlePx * s}px ${LAYOUT.font}`;
  const subFont = `400 ${LAYOUT.subtitlePx * s}px ${LAYOUT.font}`;
  const subLines = subtitle.split('\n');
  const subFirstY = textTop + LAYOUT.subtitleTop * s;
  const blockBottom =
    subFirstY + (subLines.length - 1) * LAYOUT.lineGap * s + LAYOUT.subtitlePx * s;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Fading dark scrim behind the text (so it doesn't mix with constellation names).
  if (opts.scrim) {
    ctx.font = titleFont;
    const titleW = Math.min(maxTextWidth, ctx.measureText(title).width);
    ctx.font = subFont;
    const subW = Math.min(
      maxTextWidth,
      Math.max(0, ...subLines.map((l) => ctx.measureText(l).width))
    );
    const halfW = Math.max(titleW, subW) / 2 + 46 * s;
    const halfH = (blockBottom - textTop) / 2 + 40 * s;
    drawTextScrim(ctx, cx, (textTop + blockBottom) / 2, halfW, halfH, background);
  }

  // Title
  ctx.fillStyle = textColor;
  ctx.font = titleFont;
  if (title) ctx.fillText(title, cx, textTop, maxTextWidth);

  // Subtitle (supports "\n" for multiple lines)
  ctx.fillStyle = mutedColor;
  ctx.font = subFont;
  let y = subFirstY;
  for (const line of subLines) {
    ctx.fillText(line, cx, y, maxTextWidth);
    y += LAYOUT.lineGap * s;
  }

  // Watermark (bottom-right corner)
  // TODO(milestone-2): make this a toggle (paid tier removes it) and swap the
  // placeholder for the real @channel handle.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = `500 ${LAYOUT.watermarkPx * s}px ${LAYOUT.font}`;
  ctx.fillStyle = mutedColor;
  ctx.globalAlpha = 0.85;
  ctx.fillText(watermark, width - margin, height - margin * 0.6);
  ctx.globalAlpha = 1;
}
