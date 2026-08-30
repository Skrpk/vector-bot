// Constellation-artwork overlay (Stellarium-style illustrations warped onto the
// sky). Data is generated at build time by scripts/build-constellation-art.mjs.
//
// Each illustration has 3 anchors mapping image pixels → catalogue stars (HIP).
// We project those stars to canvas pixels with d3-celestial's live projection,
// solve the affine transform image→screen, and draw the image behind the stars.

import artDataRaw from './constellation-art.generated.json';
import anchorStarsRaw from './art-anchor-stars.generated.json';

export interface ArtAnchor {
  x: number;
  y: number;
  hip: number;
}
export interface ArtItem {
  key: string;
  file: string;
  size: [number, number];
  anchors: ArtAnchor[];
}
export interface ArtSet {
  id: string;
  label: string;
  items: ArtItem[];
}

const artData = artDataRaw as unknown as { sets: ArtSet[] };
const anchorStars = anchorStarsRaw as unknown as Record<string, [number, number]>;

/** d3-celestial's projection: [lon, lat] → [x, y] in CSS-pixel space (or null). */
export type SkyProjection = ((coords: [number, number]) => [number, number] | null) & {
  translate?: () => [number, number];
};

/** Selectable art sets, for the UI. */
export const ART_SETS: { id: string; label: string }[] = artData.sets.map((s) => ({
  id: s.id,
  label: s.label,
}));
export const DEFAULT_ART_SET_ID = artData.sets[0]?.id ?? '';
export function hasArtSets(): boolean {
  return artData.sets.length > 0;
}

const setById = new Map(artData.sets.map((s) => [s.id, s]));
const artUrl = (setId: string, file: string) => `/constellation-art/${setId}/${file}`;

// --- image loading / cache -------------------------------------------------
const imgCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): Promise<void> {
  if (imgCache.has(url)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imgCache.set(url, img);
      resolve();
    };
    img.onerror = () => resolve(); // missing image → just skip it at draw time
    img.src = url;
  });
}

/** Preload every illustration in a set (once; cached thereafter). */
export async function loadArtSet(setId: string): Promise<void> {
  const set = setById.get(setId);
  if (!set) return;
  await Promise.all(set.items.map((it) => loadImage(artUrl(setId, it.file))));
}

// --- affine from 3 point correspondences -----------------------------------
// Returns [a, b, c, d, e, f] for ctx.setTransform, mapping image (x,y) → screen.
function affine3(
  src: [number, number][],
  dst: [number, number][]
): [number, number, number, number, number, number] | null {
  const [[x1, y1], [x2, y2], [x3, y3]] = src;
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
  if (Math.abs(det) < 1e-6) return null;
  const solve = (X1: number, X2: number, X3: number) => {
    const a = (X1 * (y2 - y3) - y1 * (X2 - X3) + (X2 * y3 - X3 * y2)) / det;
    const c = (x1 * (X2 - X3) - X1 * (x2 - x3) + (x2 * X3 - x3 * X2)) / det;
    const e =
      (x1 * (y2 * X3 - y3 * X2) - y1 * (x2 * X3 - x3 * X2) + X1 * (x2 * y3 - x3 * y2)) /
      det;
    return [a, c, e] as const;
  };
  const [a, c, e] = solve(dst[0][0], dst[1][0], dst[2][0]);
  const [b, d, f] = solve(dst[0][1], dst[1][1], dst[2][1]);
  return [a, b, c, d, e, f];
}

/**
 * Draw a set's illustrations onto `canvas`, positioned by projecting each item's
 * anchor stars. Uses `destination-over` so art lands *behind* the already-drawn
 * stars/lines/names; the caller fills the background afterwards (also
 * destination-over). Only constellations fully inside the sky disc are drawn.
 */
export function drawConstellationArt(
  canvas: HTMLCanvasElement,
  projection: SkyProjection,
  opts: { setId: string; opacity?: number }
): void {
  const set = setById.get(opts.setId);
  if (!set || !projection?.translate) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const tr = projection.translate();
  const scale = canvas.width / (tr[0] * 2); // CSS px → device px
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = canvas.width / 2; // sky-disc radius

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = opts.opacity ?? 0.5;

  for (const item of set.items) {
    const img = imgCache.get(artUrl(opts.setId, item.file));
    if (!img) continue;

    const dst: [number, number][] = [];
    let visible = true;
    for (const a of item.anchors) {
      const rd = anchorStars[a.hip];
      if (!rd) {
        visible = false;
        break;
      }
      const p = projection(rd);
      if (!p || Number.isNaN(p[0]) || Number.isNaN(p[1])) {
        visible = false;
        break;
      }
      const dx = p[0] * scale;
      const dy = p[1] * scale;
      // Below-horizon / clipped stars project outside the disc — skip the whole
      // figure so we never draw art for a constellation that isn't up.
      if (Math.hypot(dx - cx, dy - cy) > R) {
        visible = false;
        break;
      }
      dst.push([dx, dy]);
    }
    if (!visible || dst.length < 3) continue;

    const m = affine3(
      item.anchors.map((a) => [a.x, a.y]),
      dst
    );
    if (!m) continue;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(img, 0, 0);
  }

  ctx.restore(); // restores transform, composite op, alpha and clip
}
