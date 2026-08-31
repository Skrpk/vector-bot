'use client';

import { useEffect, useRef, useState } from 'react';
import InputForm, { type GeneratePayload } from '@/components/InputForm';
import PosterCanvas, { type OutputTab } from '@/components/PosterCanvas';
import SkyOptionsControls from '@/components/SkyOptions';
import {
  composePoster,
  DEFAULT_POSTER_PAPER_ID,
  DEFAULT_POSTER_SIZE_ID,
  posterPaperById,
  posterSizeById,
} from '@/lib/sky/composePoster';
import { bgColorById, DEFAULT_BG_COLOR_ID } from '@/lib/sky/celestial-config';
import { DEFAULT_ART_SET_ID, hasArtSets } from '@/lib/sky/constellation-art';
import {
  composeWallpaper,
  DEFAULT_WALLPAPER_SIZE_ID,
  wallpaperSizeById,
} from '@/lib/sky/composeWallpaper';
import { exportPng } from '@/lib/sky/exportPng';
import { renderStarMap } from '@/lib/sky/renderStarMap';
import type { SkyOptions, Theme } from '@/lib/sky/types';
import { initTelegram } from '@/lib/telegram/bootstrap';
import { sendPngToChat } from '@/lib/telegram/sendPngToChat';
import { DEFAULT_THEME } from '@/lib/telegram/theme';

const SKY_SIZE = 1000;
// Larger so the full-bleed wallpaper (sky scaled to cover the frame) stays crisp.
const WALLPAPER_SKY_SIZE = 1600;
// TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
const WATERMARK = '@vector_2049_bot';

const DEFAULT_SKY_OPTIONS: SkyOptions = {
  milkyWay: false,
  constellations: true,
  constellationNames: false,
  constellationArt: true,
};

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
  const outputRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [status, setStatus] = useState('Pick a date and place, then render the sky.');
  const [loading, setLoading] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [activeTab, setActiveTab] = useState<OutputTab>('wallpaper');
  const [posterSizeId, setPosterSizeId] = useState(DEFAULT_POSTER_SIZE_ID);
  const [posterPaperId, setPosterPaperId] = useState(DEFAULT_POSTER_PAPER_ID);
  const [wallpaperSizeId, setWallpaperSizeId] = useState(DEFAULT_WALLPAPER_SIZE_ID);
  const [skyOptions, setSkyOptions] = useState<SkyOptions>(DEFAULT_SKY_OPTIONS);
  const [bgColorId, setBgColorId] = useState<string>(DEFAULT_BG_COLOR_ID);
  const [artSetId, setArtSetId] = useState<string>(DEFAULT_ART_SET_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Telegram context: inside the Mini App we send the image into the chat
  // (browser download is blocked in the webview); elsewhere we download.
  // `isTelegram` is state (drives the button label); initData is only read at
  // send time, so a ref avoids re-renders.
  const [isTelegram, setIsTelegram] = useState(false);
  const initDataRef = useRef('');
  const fileStampRef = useRef<string | null>(null);
  // Last inputs, so toggling a sky option can re-render without re-entering the form.
  const lastPayloadRef = useRef<GeneratePayload | null>(null);
  // Snapshots of each output's star map, so changing a size recomposes instantly
  // without re-rendering the sky.
  const posterSkyRef = useRef<HTMLCanvasElement | null>(null);
  const posterMetaRef = useRef<{
    title: string;
    subtitle: string;
    watermark: string;
    scrim: boolean;
  } | null>(null);
  const wallpaperSkyRef = useRef<HTMLCanvasElement | null>(null);
  const wallpaperMetaRef = useRef<{
    title: string;
    place: string;
    date: string;
    watermark: string;
    background: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    initTelegram()
      .then((ctx) => {
        if (!active) return;
        setTheme(ctx.theme);
        setIsTelegram(ctx.isTelegram);
        initDataRef.current = ctx.initData;
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

  // Recompose the poster (from the cached sky snapshot) when the size or paper changes.
  useEffect(() => {
    if (!posterSkyRef.current || !posterRef.current || !posterMetaRef.current) return;
    const size = posterSizeById(posterSizeId);
    const paper = posterPaperById(posterPaperId);
    composePoster(posterRef.current, {
      starMapCanvas: posterSkyRef.current,
      ...posterMetaRef.current,
      theme,
      background: paper.bg,
      textColor: paper.text,
      mutedColor: paper.muted,
      width: size.w,
      height: size.h,
    });
  }, [posterSizeId, posterPaperId, theme]);

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

  const handleGenerate = async (
    payload: GeneratePayload,
    opts: SkyOptions,
    bgId: string,
    artSet: string
  ) => {
    if (!skyRef.current || !posterRef.current || !wallpaperRef.current) return;
    lastPayloadRef.current = payload;
    setLoading(true);
    setCanDownload(false);
    setStatus('Rendering the sky…');

    const bg = bgColorById(bgId);
    const art = opts.constellationArt && hasArtSets() ? { set: artSet } : null;
    const common = {
      date: payload.date,
      lat: payload.lat,
      lng: payload.lng,
      theme,
      size: SKY_SIZE,
      bgColor: bg,
      milkyWay: opts.milkyWay,
      constellations: opts.constellations,
      constellationNames: opts.constellationNames,
      art,
    };

    try {
      // Poster: opaque sky with constellation lines + grid.
      const posterSky = await renderStarMap(skyRef.current, common);
      // Snapshot it before the wallpaper render overwrites the shared d3 canvas,
      // so poster-size changes can recompose without re-rendering.
      posterSkyRef.current = snapshot(posterSky);
      posterMetaRef.current = {
        title: payload.title,
        subtitle: `${payload.displayDate}\n${payload.label}`,
        watermark: WATERMARK,
        scrim: opts.constellationNames,
      };
      const size = posterSizeById(posterSizeId);
      const paper = posterPaperById(posterPaperId);
      composePoster(posterRef.current, {
        starMapCanvas: posterSkyRef.current,
        ...posterMetaRef.current,
        theme,
        background: paper.bg,
        textColor: paper.text,
        mutedColor: paper.muted,
        width: size.w,
        height: size.h,
      });

      // Wallpaper: same look as the poster (dark sky + stars + constellation
      // lines), rendered larger so it stays crisp when scaled to cover the frame.
      const wallpaperSky = await renderStarMap(skyRef.current, {
        ...common,
        size: WALLPAPER_SKY_SIZE,
        background: 'sky',
      });
      wallpaperSkyRef.current = snapshot(wallpaperSky);
      wallpaperMetaRef.current = {
        title: payload.title,
        place: payload.label,
        date: payload.displayDate,
        watermark: WATERMARK,
        background: bg,
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

  // Toggling a sky option updates state and, if a render already exists,
  // re-renders both outputs (the sky pixels change, so a recompose isn't enough).
  const handleSkyOptionChange = (key: keyof SkyOptions, value: boolean) => {
    const next = { ...skyOptions, [key]: value };
    setSkyOptions(next);
    if (lastPayloadRef.current) {
      void handleGenerate(lastPayloadRef.current, next, bgColorId, artSetId);
    }
  };

  // Background colour also changes the rendered sky, so it re-renders too.
  const handleBgColorChange = (id: string) => {
    setBgColorId(id);
    if (lastPayloadRef.current) {
      void handleGenerate(lastPayloadRef.current, skyOptions, id, artSetId);
    }
  };

  // Switching the illustration set re-renders both outputs.
  const handleArtSetChange = (id: string) => {
    setArtSetId(id);
    if (lastPayloadRef.current) {
      void handleGenerate(lastPayloadRef.current, skyOptions, bgColorId, id);
    }
  };

  const handleDownload = async () => {
    const canvas = activeTab === 'wallpaper' ? wallpaperRef.current : posterRef.current;
    if (!canvas) return;
    const stamp = fileStampRef.current ?? '';
    const base = activeTab === 'wallpaper' ? 'star-wallpaper' : 'star-map';
    const suffix = activeTab === 'wallpaper' ? `-${wallpaperSizeId}` : `-${posterSizeId}`;
    const base_name = stamp ? `${base}-${stamp}${suffix}` : `${base}${suffix}`;
    const name = base_name.endsWith('.png') ? base_name : `${base_name}.png`;

    // Inside Telegram, a browser download is blocked in the webview — send the
    // PNG into the chat as a file via the bot instead.
    if (isTelegram) {
      if (!initDataRef.current) {
        setStatus('Cannot send — reopen the app from the bot.');
        return;
      }
      setSending(true);
      setStatus('Sending to your chat…');
      try {
        const result = await sendPngToChat(canvas, name, initDataRef.current, WATERMARK);
        setStatus(result.ok ? 'Sent to your chat ✓' : result.error);
      } catch (err) {
        console.error(err);
        setStatus('Could not send the image.');
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      await exportPng(canvas, name);
    } catch (err) {
      console.error(err);
      setStatus('Could not export PNG.');
    }
  };

  // Scroll the preview into view. Programmatic `behavior:'smooth'` silently
  // no-ops in some webviews (Telegram in-app browser / iOS Safari) and in
  // headless Chromium, so we attempt smooth then fall back to an instant scroll
  // if nothing actually moved — guaranteeing the user lands on the output.
  const scrollOutputIntoView = () => {
    const el = outputRef.current;
    if (!el) return;
    const startY = window.scrollY;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - startY) < 2) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 350);
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Star Map Poster</h1>
        <p>The sky exactly as it looked at your date and place.</p>
      </header>

      <InputForm
        disabled={loading}
        onGenerate={(payload) => {
          void handleGenerate(payload, skyOptions, bgColorId, artSetId);
          // On an explicit "Render", bring the preview into view so the user
          // immediately sees it appear (only here, not on settings re-renders).
          scrollOutputIntoView();
        }}
      />

      <div ref={outputRef} />
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={settingsOpen}
        aria-controls="sky-settings"
        onClick={() => setSettingsOpen((v) => !v)}
      >
        <span aria-hidden="true">⚙</span> Settings
        <span className="settings-toggle__chevron" aria-hidden="true">
          {settingsOpen ? '▾' : '▸'}
        </span>
      </button>

      {settingsOpen && (
        <div id="sky-settings">
          <SkyOptionsControls
            value={skyOptions}
            bgColorId={bgColorId}
            artSetId={artSetId}
            disabled={loading}
            onChange={handleSkyOptionChange}
            onBgColorChange={handleBgColorChange}
            onArtSetChange={handleArtSetChange}
          />
        </div>
      )}

      <div style={{ scrollMarginTop: 12 }}>
        <PosterCanvas
          posterRef={posterRef}
          wallpaperRef={wallpaperRef}
          skyRef={skyRef}
          formRef={formRef}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          posterSizeId={posterSizeId}
          onPosterSizeChange={setPosterSizeId}
          posterPaperId={posterPaperId}
          onPosterPaperChange={setPosterPaperId}
          wallpaperSizeId={wallpaperSizeId}
          onWallpaperSizeChange={setWallpaperSizeId}
          status={status}
          loading={loading}
          canDownload={canDownload}
          onDownload={handleDownload}
          inTelegram={isTelegram}
          sending={sending}
        />
      </div>

      <footer className="app__credits">
        Geocoding by Open-Meteo · Places © OpenStreetMap contributors
      </footer>
    </main>
  );
}
