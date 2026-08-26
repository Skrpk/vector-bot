import type { CelestialConfig } from './celestial-loader';
import { CELESTIAL_DATA_PATH } from './celestial-loader';

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
}

/**
 * A clean, poster-friendly d3-celestial configuration: local sky centered on the
 * zenith (airy projection = horizon-to-horizon circular view), white stars in
 * spectral colours, subtle constellation lines, a faint Milky Way and graticule.
 * Non-interactive and animation-free so it renders a single deterministic frame.
 */
export function buildCelestialConfig({
  containerId,
  size,
  lat,
  lng,
}: BuildArgs): CelestialConfig {
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
    background: { fill: SKY_BACKGROUND, opacity: 1 },

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
      lines: true,
      bounds: false,
      lineStyle: { stroke: '#7d8bbd', width: 0.7, opacity: 0.55 },
    },

    mw: {
      show: true,
      style: { fill: '#ffffff', opacity: 0.07 },
    },

    lines: {
      graticule: {
        show: true,
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
