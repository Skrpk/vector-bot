// Draws a soft, edge-fading dark backdrop behind text so it stays legible over a
// busy star field / constellation names, without a hard rectangle.

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Fill an elliptical radial gradient centred at (cx, cy): opaque-ish `color` in
 * the middle fading to fully transparent at the ellipse edge (semi-axes halfW/
 * halfH). Draw it after the sky and before the text.
 */
export function drawTextScrim(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  color: string,
  maxAlpha = 0.72
): void {
  const { r, g, b } = hexToRgb(color);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(halfW, halfH); // unit circle → ellipse with the given semi-axes
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${maxAlpha})`);
  grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${maxAlpha})`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
