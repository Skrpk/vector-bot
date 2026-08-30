// Shared types for the star-map render pipeline. The UI and Telegram layers
// depend on these; nothing here imports d3-celestial.

export type ThemeMode = 'light' | 'dark';

/**
 * The minimal theme the render pipeline needs. Produced from Telegram theme
 * params when running inside Telegram, or from a sensible default in a plain
 * browser (see lib/telegram/theme.ts).
 */
export interface Theme {
  mode: ThemeMode;
  /** Poster / sky background. */
  background: string;
  /** Primary text colour (title, labels). */
  text: string;
  /** Muted text colour (subtitle, watermark). */
  muted: string;
  /** Accent colour (framing ring, highlights). */
  accent: string;
}

/** Sky background: opaque deep-space colour (poster) or transparent (wallpaper). */
export type SkyBackground = 'sky' | 'transparent';

/** User-toggleable sky layers, shared by the poster and wallpaper outputs. */
export interface SkyOptions {
  /** Draw the Milky Way band. */
  milkyWay: boolean;
  /** Draw constellation connection lines. */
  constellations: boolean;
  /** Draw constellation names (Ukrainian). */
  constellationNames: boolean;
}

/** Inputs to renderStarMap. */
export interface RenderOptions extends Partial<SkyOptions> {
  /**
   * The absolute UTC instant the sky is drawn for. Callers must resolve the
   * user's local wall-clock + timezone → UTC first (lib/time/localToUtc.ts).
   */
  date: Date;
  /** Latitude in degrees, -90..90. */
  lat: number;
  /** Longitude in degrees, -180..180. */
  lng: number;
  theme: Theme;
  /** Square pixel size of the rendered sky canvas. Defaults to 1000. */
  size?: number;
  /** Sky background fill mode. Defaults to 'sky' (opaque). */
  background?: SkyBackground;
  /** Background fill colour (hex), e.g. deep-space navy or black. */
  bgColor?: string;
  // milkyWay / constellations / constellationNames come from Partial<SkyOptions>.
}

/** A selectable poster print size and its export pixel dimensions. */
export interface PosterSize {
  /** Stable id, e.g. "40x50". */
  id: string;
  /** Display label, e.g. "40×50 cm". */
  label: string;
  /** Physical size in centimetres [width, height]. */
  cm: [number, number];
  /** Export pixel width. */
  w: number;
  /** Export pixel height. */
  h: number;
}

/** Inputs to composePoster. */
export interface PosterOptions {
  starMapCanvas: HTMLCanvasElement;
  title: string;
  subtitle: string;
  watermark: string;
  theme: Theme;
  /** Poster background fill colour (hex) — matches the sky background. */
  background: string;
  /** Draw a fading dark scrim behind the text (used when names are on). */
  scrim?: boolean;
  /** Export pixel width (from the selected PosterSize). */
  width: number;
  /** Export pixel height (from the selected PosterSize). */
  height: number;
}

/** A selectable phone-wallpaper resolution. */
export interface WallpaperSize {
  /** Stable id, e.g. "9x195". */
  id: string;
  /** Display label, e.g. "9:19.5". */
  label: string;
  /** Export pixel width. */
  w: number;
  /** Export pixel height. */
  h: number;
}

/**
 * Inputs to composeWallpaper. No theme: the wallpaper is white text on the same
 * dark sky (stars + constellation lines) as the poster (see composeWallpaper).
 */
export interface WallpaperOptions {
  starMapCanvas: HTMLCanvasElement;
  /** Place name, e.g. "Prague, Prague, Czechia". */
  place: string;
  /** Human-readable date/time line. */
  date: string;
  watermark: string;
  /** Wallpaper background fill colour (hex) — matches the sky background. */
  background: string;
  /** Draw a fading dark scrim behind the text (used when names are on). */
  scrim?: boolean;
  /** Export pixel width (from the selected WallpaperSize). */
  width: number;
  /** Export pixel height (from the selected WallpaperSize). */
  height: number;
}
