import type { CelestialConfig } from './celestial-loader';
import { CELESTIAL_DATA_PATH } from './celestial-loader';
import type { SkyBackground } from './types';

/**
 * Selectable sky background colours. We keep the sky dark regardless of the app
 * theme — a light sky hides the stars. 'space' is the default deep-space navy.
 */
export const BG_COLORS = {
  space: '#0b1020',
  black: '#000000',
} as const;

export type BgColorId = keyof typeof BG_COLORS;
export const DEFAULT_BG_COLOR_ID: BgColorId = 'space';

export function bgColorById(id: string): string {
  return BG_COLORS[(id as BgColorId) in BG_COLORS ? (id as BgColorId) : 'space'];
}

/** Back-compat default background colour. */
export const SKY_BACKGROUND = BG_COLORS.space;

interface BuildArgs {
  containerId: string;
  size: number;
  lat: number;
  lng: number;
  /** 'sky' (opaque) or 'transparent'. Default 'sky'. */
  background?: SkyBackground;
  /** Background fill colour (hex). Defaults to the deep-space navy. */
  bgColor?: string;
  /** Toggle the Milky Way band. Default true. */
  milkyWay?: boolean;
  /** Toggle constellation connection lines. Default true. */
  constellations?: boolean;
  /** Toggle constellation names (Ukrainian). Default false. */
  constellationNames?: boolean;
}

/**
 * A clean d3-celestial configuration: local sky centered on the zenith (airy
 * projection = horizon-to-horizon circular view), white stars in spectral colours.
 * The Milky Way, constellation lines and constellation names are user-toggleable
 * (see SkyOptions); a faint graticule is always drawn. Non-interactive and
 * animation-free so it renders a single deterministic frame.
 */
export function buildCelestialConfig({
  containerId,
  size,
  lat,
  lng,
  background = 'sky',
  bgColor = SKY_BACKGROUND,
  milkyWay = true,
  constellations = true,
  constellationNames = false,
}: BuildArgs): CelestialConfig {
  const transparent = background === 'transparent';
  // Constellation-name font scales with the render size (CSS-px space ≈ `size`).
  const namePx = Math.round((size / 1000) * 16);

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
    background: { fill: bgColor, opacity: transparent ? 0 : 1 },

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
      names: constellationNames,
      namesType: 'uk', // Ukrainian names injected into constellations.json
      nameStyle: {
        fill: '#dfe6ff',
        font: `${namePx}px 'Helvetica Neue', Arial, sans-serif`,
        align: 'center',
        baseline: 'middle',
        opacity: 0.9,
      },
      lines: constellations,
      bounds: false,
      lineStyle: { stroke: '#7d8bbd', width: 0.7, opacity: 0.55 },
    },

    mw: {
      show: milkyWay,
      style: { fill: '#ffffff', opacity: transparent ? 0.12 : 0.07 },
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
