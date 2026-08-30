import type { CelestialConfig } from './celestial-loader';
import { CELESTIAL_DATA_PATH } from './celestial-loader';
import type { SkyBackground, SkyLayers } from './types';

/**
 * Fixed deep-space background for the sky itself. We keep the *sky* dark
 * regardless of the app theme — a light-coloured sky reads poorly and hides the
 * stars. The surrounding poster chrome still follows the theme (see composePoster).
 */
export const SKY_BACKGROUND = '#0b1020';

interface BuildArgs {
  containerId: string;
  size: number;
  lat: number;
  lng: number;
  /** 'sky' (opaque, poster) or 'transparent' (wallpaper). Default 'sky'. */
  background?: SkyBackground;
  /** 'full' (poster) or 'stars' (wallpaper: no constellation lines / grid). */
  layers?: SkyLayers;
}

/**
 * A clean d3-celestial configuration: local sky centered on the zenith (airy
 * projection = horizon-to-horizon circular view), white stars in spectral colours,
 * a faint Milky Way. `background`/`layers` tailor it per output:
 *  - poster:    opaque sky + constellation lines + graticule ('sky' / 'full')
 *  - wallpaper: transparent + stars only ('transparent' / 'stars')
 * Non-interactive and animation-free so it renders a single deterministic frame.
 */
export function buildCelestialConfig({
  containerId,
  size,
  lat,
  lng,
  background = 'sky',
  layers = 'full',
}: BuildArgs): CelestialConfig {
  const transparent = background === 'transparent';
  const starsOnly = layers === 'stars';

  return {
    container: containerId,
    datapath: CELESTIAL_DATA_PATH,
    width: size, // height follows the (≈square) airy projection ratio
    projection: 'airy',
    transform: 'equatorial',
    follow: 'zenith',
    geopos: [lat, lng],
    interactive: false,
    controls: false,
    form: false,
    disableAnimations: true,
    settimezone: false, // avoid remote TimeZoneDB lookups; sky uses absolute time
    // opacity 0 → each redraw's clearRect leaves the canvas transparent (stars
    // and Milky Way still draw on top). Opaque deep-space colour otherwise.
    background: { fill: SKY_BACKGROUND, opacity: transparent ? 0 : 1 },

    stars: {
      show: true,
      limit: 6,
      colors: true,
      style: { fill: '#ffffff', opacity: 1 },
      designation: false,
      propername: false,
      size: 6,
      exponent: -0.28,
      data: 'stars.6.json',
    },

    dsos: { show: false },
    planets: { show: false },

    constellations: {
      names: false,
      lines: !starsOnly,
      bounds: false,
      lineStyle: { stroke: '#7d8bbd', width: 0.7, opacity: 0.55 },
    },

    mw: {
      show: true,
      style: { fill: '#ffffff', opacity: transparent ? 0.12 : 0.07 },
    },

    lines: {
      graticule: {
        show: !starsOnly,
        stroke: '#2a3352',
        width: 0.5,
        opacity: 0.5,
        lon: { pos: [''] },
        lat: { pos: [''] },
      },
      equatorial: { show: false },
      ecliptic: { show: false },
      galactic: { show: false },
      supergalactic: { show: false },
    },

    horizon: { show: false },
    daylight: { show: false },
  };
}
