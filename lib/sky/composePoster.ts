import type { PosterOptions } from './types';

/**
 * Poster layout. All geometry/typography lives here so the poster is easy to
 * restyle in one place. Units are pixels on the export canvas (portrait 4:5).
 *
 * TODO(milestone-2): promote this to multiple named premium styles and make the
 * export resolution configurable (see exportPng / EXPORT scale).
 */
export const POSTER = {
  width: 1080,
  height: 1350,
  margin: 90,
  /** Sky circle diameter as a fraction of poster width. */
  skyDiameterRatio: 0.82,
  /** Vertical center of the sky circle as a fraction of poster height. */
  skyCenterYRatio: 0.42,
  ringWidth: 3,
  titleFont: "600 62px 'Helvetica Neue', Arial, sans-serif",
  subtitleFont: "400 30px 'Helvetica Neue', Arial, sans-serif",
  watermarkFont: "500 26px 'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Draw the composed poster (sky + title + subtitle + watermark) onto `canvas`.
 * The star map is drawn clipped into a circle with a thin accent ring; the app
 * theme colours the chrome while the sky keeps its own dark background.
 */
export function composePoster(canvas: HTMLCanvasElement, opts: PosterOptions): void {
  const { starMapCanvas, title, subtitle, watermark, theme } = opts;

  canvas.width = POSTER.width;
  canvas.height = POSTER.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  // Background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, POSTER.width, POSTER.height);

  // Sky circle geometry
  const diameter = POSTER.width * POSTER.skyDiameterRatio;
  const radius = diameter / 2;
  const cx = POSTER.width / 2;
  const cy = POSTER.height * POSTER.skyCenterYRatio;

  // Clip the (square) star map into the circle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Cover-fit the square source into the circle's bounding box.
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
  ctx.lineWidth = POSTER.ringWidth;
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Title
  const textTop = cy + radius + 96;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.text;
  ctx.font = POSTER.titleFont;
  ctx.fillText(title, cx, textTop, POSTER.width - POSTER.margin * 2);

  // Subtitle (supports "\n" for multiple lines)
  ctx.fillStyle = theme.muted;
  ctx.font = POSTER.subtitleFont;
  const lines = subtitle.split('\n');
  let y = textTop + 84;
  for (const line of lines) {
    ctx.fillText(line, cx, y, POSTER.width - POSTER.margin * 2);
    y += 42;
  }

  // Watermark (bottom-right corner)
  // TODO(milestone-2): make this a toggle (paid tier removes it) and swap the
  // placeholder for the real @channel handle.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.font = POSTER.watermarkFont;
  ctx.fillStyle = theme.muted;
  ctx.globalAlpha = 0.85;
  ctx.fillText(
    watermark,
    POSTER.width - POSTER.margin,
    POSTER.height - POSTER.margin * 0.6
  );
  ctx.globalAlpha = 1;
}
