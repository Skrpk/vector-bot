// Loads the vendored d3-celestial runtime (and its bundled d3 v3) by injecting
// <script> tags in the right order, exactly as d3-celestial's own demos do.
// Runs in the browser only. Idempotent: the scripts are injected at most once
// and concurrent callers share a single in-flight promise.

/** Minimal shape of the global `Celestial` object we use. */
export interface CelestialConfig {
  [key: string]: unknown;
}

export interface Celestial {
  display(config: CelestialConfig): void;
  /** Set date/location/timezone and redraw. */
  skyview(cfg: { date?: Date; location?: [number, number]; timezone?: number }): void;
  /** Register a callback invoked after each redraw completes. */
  addCallback(fn: (() => void) | null): void;
  redraw(): void;
  resize(config?: CelestialConfig): void;
  clear(): void;
  /** Live d3 projection: [lon,lat] → [x,y] in CSS px, with `.translate()`. */
  mapProjection?: ((coords: [number, number]) => [number, number] | null) & {
    translate?: () => [number, number];
  };
}

declare global {
  interface Window {
    Celestial?: Celestial;
    d3?: unknown;
  }
}

/** Public base path (under /public) where copy-celestial.mjs put the assets. */
const BASE = '/celestial';
export const CELESTIAL_DATA_PATH = `${BASE}/data/`;

// Order matters: d3 v3 core, then the geo-projection plugin, then celestial.
const SCRIPTS = [
  `${BASE}/lib/d3.min.js`,
  `${BASE}/lib/d3.geo.projection.min.js`,
  `${BASE}/celestial.min.js`,
];

let loadPromise: Promise<Celestial> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-celestial="${src}"]`
    );
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = false; // preserve execution order across the three files
    el.dataset.celestial = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

/** Load d3-celestial once and resolve with the global `Celestial` object. */
export function loadCelestial(): Promise<Celestial> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadCelestial must run in the browser'));
  }
  if (window.Celestial) return Promise.resolve(window.Celestial);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    for (const src of SCRIPTS) {
      // Sequential: each script depends on the previous global being present.
      await injectScript(src);
    }
    if (!window.Celestial) {
      throw new Error('d3-celestial loaded but window.Celestial is undefined');
    }
    return window.Celestial;
  })();

  return loadPromise;
}
