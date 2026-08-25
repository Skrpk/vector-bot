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

/** Inputs to renderStarMap. */
export interface RenderOptions {
  /** The moment the sky is drawn for (UTC-aware Date). */
  date: Date;
  /** Latitude in degrees, -90..90. */
  lat: number;
  /** Longitude in degrees, -180..180. */
  lng: number;
  theme: Theme;
  /** Square pixel size of the rendered sky canvas. Defaults to 1000. */
  size?: number;
}

/** Inputs to composePoster. */
export interface PosterOptions {
  starMapCanvas: HTMLCanvasElement;
  title: string;
  subtitle: string;
  watermark: string;
  theme: Theme;
}
