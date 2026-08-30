'use client';

import { useEffect, useRef, useState } from 'react';
import InputForm, { type GeneratePayload } from '@/components/InputForm';
import PosterCanvas, { type OutputTab } from '@/components/PosterCanvas';
import {
  composePoster,
  DEFAULT_POSTER_SIZE_ID,
  posterSizeById,
} from '@/lib/sky/composePoster';
import {
  composeWallpaper,
  DEFAULT_WALLPAPER_SIZE_ID,
  wallpaperSizeById,
} from '@/lib/sky/composeWallpaper';
import { exportPng } from '@/lib/sky/exportPng';
import { renderStarMap } from '@/lib/sky/renderStarMap';
import type { Theme } from '@/lib/sky/types';
import { initTelegram } from '@/lib/telegram/bootstrap';
import { DEFAULT_THEME } from '@/lib/telegram/theme';

const SKY_SIZE = 1000;
// Larger so the full-bleed wallpaper (sky scaled to cover the frame) stays crisp.
const WALLPAPER_SKY_SIZE = 1600;
// TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
const WATERMARK = '@vector_2049_bot';
const POSTER_TITLE = 'THE NIGHT SKY';

/** Copy a canvas's pixels into a fresh detached canvas we can keep and reuse. */
function snapshot(source: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  c.getContext('2d')?.drawImage(source, 0, 0);
  return c;
}

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
  const [posterSizeId, setPosterSizeId] = useState(DEFAULT_POSTER_SIZE_ID);
  const [wallpaperSizeId, setWallpaperSizeId] = useState(DEFAULT_WALLPAPER_SIZE_ID);
  const fileStampRef = useRef<string | null>(null);
  // Snapshots of each output's star map, so changing a size recomposes instantly
  // without re-rendering the sky.
  const posterSkyRef = useRef<HTMLCanvasElement | null>(null);
  const posterMetaRef = useRef<{
    title: string;
    subtitle: string;
    watermark: string;
  } | null>(null);
  const wallpaperSkyRef = useRef<HTMLCanvasElement | null>(null);
  const wallpaperMetaRef = useRef<{
    place: string;
    date: string;
    watermark: string;
  } | null>(null);

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

  // Recompose the poster (from the cached sky snapshot) when the size changes.
  useEffect(() => {
    if (!posterSkyRef.current || !posterRef.current || !posterMetaRef.current) return;
    const size = posterSizeById(posterSizeId);
    composePoster(posterRef.current, {
      starMapCanvas: posterSkyRef.current,
      ...posterMetaRef.current,
      theme,
      width: size.w,
      height: size.h,
    });
  }, [posterSizeId, theme]);

  // Recompose the wallpaper (from its cached sky snapshot) when the size changes.
  useEffect(() => {
    if (!wallpaperSkyRef.current || !wallpaperRef.current || !wallpaperMetaRef.current)
      return;
    const size = wallpaperSizeById(wallpaperSizeId);
    composeWallpaper(wallpaperRef.current, {
      starMapCanvas: wallpaperSkyRef.current,
      ...wallpaperMetaRef.current,
      width: size.w,
      height: size.h,
    });
  }, [wallpaperSizeId]);

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
      // Snapshot it before the wallpaper render overwrites the shared d3 canvas,
      // so poster-size changes can recompose without re-rendering.
      posterSkyRef.current = snapshot(posterSky);
      posterMetaRef.current = {
        title: POSTER_TITLE,
        subtitle: `${payload.displayDate}\n${payload.label}`,
        watermark: WATERMARK,
      };
      const size = posterSizeById(posterSizeId);
      composePoster(posterRef.current, {
        starMapCanvas: posterSkyRef.current,
        ...posterMetaRef.current,
        theme,
        width: size.w,
        height: size.h,
      });

      // Wallpaper: same look as the poster (dark sky + stars + constellation
      // lines), rendered larger so it stays crisp when scaled to cover the frame.
      const wallpaperSky = await renderStarMap(skyRef.current, {
        ...common,
        size: WALLPAPER_SKY_SIZE,
        background: 'sky',
        layers: 'full',
      });
      wallpaperSkyRef.current = snapshot(wallpaperSky);
      wallpaperMetaRef.current = {
        place: payload.label,
        date: payload.displayDate,
        watermark: WATERMARK,
      };
      const wSize = wallpaperSizeById(wallpaperSizeId);
      composeWallpaper(wallpaperRef.current, {
        starMapCanvas: wallpaperSkyRef.current,
        ...wallpaperMetaRef.current,
        width: wSize.w,
        height: wSize.h,
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
    const suffix = activeTab === 'wallpaper' ? `-${wallpaperSizeId}` : `-${posterSizeId}`;
    const name = stamp ? `${base}-${stamp}${suffix}` : `${base}${suffix}`;
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
        posterSizeId={posterSizeId}
        onPosterSizeChange={setPosterSizeId}
        wallpaperSizeId={wallpaperSizeId}
        onWallpaperSizeChange={setWallpaperSizeId}
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
