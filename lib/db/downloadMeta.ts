// Shape of the per-download metadata the client sends to /api/send-to-chat and
// the server logs. Type-only module (no runtime deps) so the browser can import
// it without pulling in the DB client.
export interface DownloadMeta {
  title?: string;
  /** Picked calendar date, YYYY-MM-DD. */
  eventDate?: string;
  placeName?: string;
  lat?: number;
  lng?: number;
  timezone?: string | null;
  outputKind: 'poster' | 'wallpaper';
  sizeId?: string;
  bgColorId?: string;
  /** Remaining export config (toggles / art set / paper) as a free-form blob. */
  skyOptions?: Record<string, unknown>;
}
