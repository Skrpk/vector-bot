import { buildCelestialConfig } from './celestial-config';
import { loadCelestial } from './celestial-loader';
import type { RenderOptions } from './types';

const DEFAULT_SIZE = 1000;
const RENDER_TIMEOUT_MS = 15000;

/**
 * Render the night sky for a given date + location into `container` using
 * d3-celestial, and resolve with the <canvas> it produced.
 *
 * `opts.date` must be the **absolute UTC instant** to render (the caller resolves
 * the user's local wall-clock + timezone → UTC; see lib/time/localToUtc.ts).
 *
 * The signature takes a *container element* (not a caller-owned canvas):
 * d3-celestial creates and owns its own <canvas> inside the container. The caller
 * (composePoster) reads pixels off the returned canvas.
 *
 * DOM contract (set up by PosterCanvas): `container` (id "celestial-map") must be
 * in the DOM with a non-zero size, immediately followed by a sibling
 * `<div id="celestial-form">`. d3-celestial builds hidden date/lat/lon inputs into
 * that sibling and reads them back when applying the view — without it, rendering
 * throws.
 *
 * Completion: d3-celestial fires `addCallback` after it loads the catalogs and
 * draws the first frame. We then apply the exact date + location via `skyview()`,
 * which redraws synchronously (animations are disabled); the canvas is final once
 * it returns.
 *
 * Why we detach with a no-op instead of `null`: d3-celestial's `runCallback()`
 * unconditionally re-sets `hasCallback = true` *after* invoking the callback, so a
 * `null` callback makes every later redraw (planet load, skyview) call `null()` and
 * throw. A no-op keeps those redraws harmless.
 */
const NOOP = () => {};
export function renderStarMap(
  container: HTMLElement,
  opts: RenderOptions
): Promise<HTMLCanvasElement> {
  const size = opts.size ?? DEFAULT_SIZE;
  const { date, lat, lng, background, layers } = opts;

  if (!container.id) container.id = 'celestial-map';
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;

  return loadCelestial().then(
    (celestial) =>
      new Promise<HTMLCanvasElement>((resolve, reject) => {
        const config = buildCelestialConfig({
          containerId: container.id,
          size,
          lat,
          lng,
          background,
          layers,
        });

        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          detach();
          reject(new Error('Star map render timed out'));
        }, RENDER_TIMEOUT_MS);

        function detach() {
          try {
            // No-op (not null) — see the note above renderStarMap.
            celestial.addCallback(NOOP);
          } catch {
            /* ignore */
          }
        }

        const onFirstDraw = () => {
          if (settled) return;
          settled = true;
          // Replace ourselves with a no-op so later redraws don't re-run this.
          detach();
          clearTimeout(timeout);
          // Defer out of d3-celestial's redraw call stack so its data-load queue
          // settles before we apply the dated view.
          setTimeout(() => {
            try {
              // `date` is the absolute UTC instant. d3-celestial computes
              //   dtc = date − (timezone − localZone)  (localZone = the browser's
              // own offset), so passing timezone = the browser offset makes that
              // shift zero and renders exactly at `date`. A timezone is also
              // required for skyview to take the go()/redraw path at all
              // (setPosition is a no-op when settimezone is false).
              celestial.skyview({
                date,
                location: [lat, lng],
                timezone: -new Date().getTimezoneOffset(),
              });
            } catch (err) {
              reject(err instanceof Error ? err : new Error(String(err)));
              return;
            }
            const canvas = container.querySelector<HTMLCanvasElement>('canvas');
            if (!canvas) {
              reject(new Error('d3-celestial produced no canvas'));
              return;
            }
            // The first redraw callback can fire before the star catalog is
            // painted (notably on a second, back-to-back render when data is
            // cached), which would hand back an empty canvas. Poll until the
            // canvas actually holds bright content, then resolve.
            waitForContent(canvas, resolve);
          }, 0);
        };

        celestial.addCallback(onFirstDraw);
        celestial.display(config);
      })
  );
}

/** Cheap check: does a downscaled snapshot contain enough bright pixels (stars/
 * lines)? Dark background and the faint boundary ring don't count. */
function hasBrightContent(canvas: HTMLCanvasElement): boolean {
  const s = document.createElement('canvas');
  s.width = 48;
  s.height = 48;
  const ctx = s.getContext('2d');
  if (!ctx) return true; // can't check → assume ready
  ctx.clearRect(0, 0, 48, 48);
  ctx.drawImage(canvas, 0, 0, 48, 48);
  const data = ctx.getImageData(0, 0, 48, 48).data;
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 10 && (data[i] + data[i + 1] + data[i + 2]) / 3 > 80) bright++;
  }
  return bright > 20;
}

function waitForContent(
  canvas: HTMLCanvasElement,
  resolve: (c: HTMLCanvasElement) => void,
  attempt = 0
): void {
  // ~3s ceiling (100 × 30ms); resolve anyway rather than hang.
  if (attempt >= 100 || hasBrightContent(canvas)) {
    resolve(canvas);
    return;
  }
  setTimeout(() => waitForContent(canvas, resolve, attempt + 1), 30);
}
