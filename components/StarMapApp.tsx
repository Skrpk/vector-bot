'use client';

import { useEffect, useRef, useState } from 'react';
import InputForm, { type GeneratePayload } from '@/components/InputForm';
import PosterCanvas, { type OutputTab } from '@/components/PosterCanvas';
import { composePoster } from '@/lib/sky/composePoster';
import { composeWallpaper } from '@/lib/sky/composeWallpaper';
import { exportPng } from '@/lib/sky/exportPng';
import { renderStarMap } from '@/lib/sky/renderStarMap';
import type { Theme } from '@/lib/sky/types';
import { initTelegram } from '@/lib/telegram/bootstrap';
import { DEFAULT_THEME } from '@/lib/telegram/theme';

const SKY_SIZE = 1000;
// Larger so the full-bleed wallpaper (sky scaled to cover the frame) stays crisp.
const WALLPAPER_SKY_SIZE = 1600;
// TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
const WATERMARK = '@your_channel';
const POSTER_TITLE = 'THE NIGHT SKY';

export default function StarMapApp() {
  const posterRef = useRef<HTMLCanvasElement | null>(null);
  const wallpaperRef = useRef<HTMLCanvasElement | null>(null);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [status, setStatus] = useState('Pick a date and place, then render the sky.');
  const [loading, setLoading] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>('poster');
  const fileStampRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    initTelegram()
      .then((ctx) => {
        if (!active) return;
        setTheme(ctx.theme);
        // TODO(milestone-2): send ctx.startParam to attribution logging.
        if (ctx.startParam) {
          console.info('[telegram] start_param:', ctx.startParam);
        }
      })
      .catch(() => {
        /* keep default theme */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleGenerate = async (payload: GeneratePayload) => {
    if (!skyRef.current || !posterRef.current || !wallpaperRef.current) return;
    setLoading(true);
    setCanDownload(false);
    setStatus('Rendering the sky…');

    const common = {
      date: payload.date,
      lat: payload.lat,
      lng: payload.lng,
      theme,
      size: SKY_SIZE,
    };

    try {
      // Poster: opaque sky with constellation lines + grid.
      const posterSky = await renderStarMap(skyRef.current, common);
      composePoster(posterRef.current, {
        starMapCanvas: posterSky,
        title: POSTER_TITLE,
        subtitle: `${payload.displayDate}\n${payload.label}`,
        watermark: WATERMARK,
        theme,
      });

      // Wallpaper: same look as the poster (dark sky + stars + constellation
      // lines), rendered larger so it stays crisp when scaled to cover the frame.
      const wallpaperSky = await renderStarMap(skyRef.current, {
        ...common,
        size: WALLPAPER_SKY_SIZE,
        background: 'sky',
        layers: 'full',
      });
      composeWallpaper(wallpaperRef.current, {
        starMapCanvas: wallpaperSky,
        place: payload.label,
        date: payload.displayDate,
        watermark: WATERMARK,
      });

      fileStampRef.current = payload.fileStamp;
      setCanDownload(true);
      setStatus('Ready — switch tabs and download.');
    } catch (err) {
      console.error(err);
      setStatus(
        err instanceof Error ? `Could not render: ${err.message}` : 'Render failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const canvas = activeTab === 'wallpaper' ? wallpaperRef.current : posterRef.current;
    if (!canvas) return;
    const stamp = fileStampRef.current ?? '';
    const base = activeTab === 'wallpaper' ? 'star-wallpaper' : 'star-map';
    const name = stamp ? `${base}-${stamp}` : base;
    try {
      await exportPng(canvas, name);
    } catch (err) {
      console.error(err);
      setStatus('Could not export PNG.');
    }
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Star Map Poster</h1>
        <p>The sky exactly as it looked at your date and place.</p>
      </header>

      <InputForm disabled={loading} onGenerate={handleGenerate} />

      <PosterCanvas
        posterRef={posterRef}
        wallpaperRef={wallpaperRef}
        skyRef={skyRef}
        formRef={formRef}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        status={status}
        canDownload={canDownload}
        onDownload={handleDownload}
      />

      <footer className="app__credits">
        Geocoding by Open-Meteo · Places © OpenStreetMap contributors
      </footer>
    </main>
  );
}
