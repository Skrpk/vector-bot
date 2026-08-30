import { buildCelestialConfig } from './celestial-config';
import { loadCelestial } from './celestial-loader';
import type { RenderOptions } from './types';

const DEFAULT_SIZE = 1000;
const RENDER_TIMEOUT_MS = 15000;
// How long redraws must stay quiet before we treat a load/apply phase as done.
const QUIET_MS = 320;

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
 * Completion — why it's not just "first redraw": d3-celestial loads each layer
 * (stars, Milky Way, constellation lines, constellation NAMES) as a *separate*
 * async fetch, and each one calls redraw() when it lands. Grabbing after the first
 * redraw intermittently misses slow layers (names arrive last; on cached
 * re-renders the order shifts). Instead we treat "redraws have been quiet for
 * QUIET_MS" as "all layers painted": wait for quiet, apply the exact date via
 * skyview(), wait for quiet again, then snapshot.
 *
 * Why we detach with a no-op instead of `null`: d3-celestial's `runCallback()`
 * unconditionally re-sets `hasCallback = true` *after* invoking the callback, so a
 * `null` callback makes every later redraw call `null()` and throw. A no-op keeps
 * those redraws harmless.
 */
const NOOP = () => {};
export function renderStarMap(
  container: HTMLElement,
  opts: RenderOptions
): Promise<HTMLCanvasElement> {
  const size = opts.size ?? DEFAULT_SIZE;
  const {
    date,
    lat,
    lng,
    background,
    bgColor,
    milkyWay,
    constellations,
    constellationNames,
  } = opts;

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
          bgColor,
          milkyWay,
          constellations,
          constellationNames,
        });

        let done = false;
        let applied = false; // has skyview() been called yet?
        let quietTimer: ReturnType<typeof setTimeout> | null = null;

        const hardTimeout = setTimeout(() => finish(), RENDER_TIMEOUT_MS);

        function detach() {
          try {
            // No-op (not null) — see the note above renderStarMap.
            celestial.addCallback(NOOP);
          } catch {
            /* ignore */
          }
        }

        function finish() {
          if (done) return;
          done = true;
          if (quietTimer) clearTimeout(quietTimer);
          clearTimeout(hardTimeout);
          detach();
          const canvas = container.querySelector<HTMLCanvasElement>('canvas');
          if (!canvas) {
            reject(new Error('d3-celestial produced no canvas'));
            return;
          }
          resolve(canvas);
        }

        function scheduleQuiet() {
          if (done) return;
          if (quietTimer) clearTimeout(quietTimer);
          quietTimer = setTimeout(onQuiet, QUIET_MS);
        }

        // Fired once redraws have stayed quiet for QUIET_MS — i.e. a load/apply
        // phase finished. First quiet → apply the dated view; second → snapshot.
        function onQuiet() {
          if (done) return;
          if (!applied) {
            applied = true;
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
              done = true;
              if (quietTimer) clearTimeout(quietTimer);
              clearTimeout(hardTimeout);
              detach();
              reject(err instanceof Error ? err : new Error(String(err)));
              return;
            }
            // Wait for skyview's redraw(s) to settle, then finish.
            scheduleQuiet();
          } else {
            finish();
          }
        }

        // Every layer load / redraw resets the quiet timer.
        const onRedraw = () => scheduleQuiet();

        celestial.addCallback(onRedraw);
        celestial.display(config);
        // display() may finish its first paint before the callback is observed;
        // arm the quiet timer immediately so we never stall waiting for a redraw.
        scheduleQuiet();
      })
  );
}
