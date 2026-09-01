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
import { initTelegram, openTelegramLink } from '@/lib/telegram/bootstrap';
import { sendPngToChat } from '@/lib/telegram/sendPngToChat';
import type { DownloadMeta } from '@/lib/db/downloadMeta';
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
  const [status, setStatus] = useState('Оберіть дату й місце, а потім згенеруйте небо.');
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
  // True after the image was delivered to the chat — shows a big green confirmation.
  const [sent, setSent] = useState(false);
  // Set when the server reports the user isn't subscribed to the channel; drives
  // the "subscribe first" prompt with a link into the channel.
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  // Telegram context: inside the Mini App we send the image into the chat
  // (browser download is blocked in the webview); elsewhere we download.
  // `initData` (the raw signed string) is sent to the server, which validates it.
  const [isTelegram, setIsTelegram] = useState(false);
  const [initData, setInitData] = useState('');
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
        setInitData(ctx.initData);
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
  ): Promise<boolean> => {
    if (!skyRef.current || !posterRef.current || !wallpaperRef.current) return false;
    lastPayloadRef.current = payload;
    setLoading(true);
    setCanDownload(false);
    setSent(false);
    setSubscribeUrl(null);
    setStatus('Малюємо небо…');

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
      setStatus('Готово — перемикайте вкладки та завантажуйте.');
      return true;
    } catch (err) {
      console.error(err);
      setStatus(
        err instanceof Error
          ? `Не вдалося згенерувати: ${err.message}`
          : 'Помилка генерації.'
      );
      return false;
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
      if (!initData) {
        setStatus('Не вдалося надіслати — відкрийте застосунок через бота.');
        return;
      }
      setSending(true);
      setSubscribeUrl(null);
      setSent(false);
      setStatus(
        'Надсилаємо у ваш чат. Це може зайняти деякий час, зачекайте будь ласка...'
      );
      // Metadata logged server-side on success (never the image itself).
      const p = lastPayloadRef.current;
      const meta: DownloadMeta = {
        title: p?.title || undefined,
        eventDate: p?.fileStamp || undefined,
        placeName: p?.label || undefined,
        lat: p?.lat,
        lng: p?.lng,
        timezone: p?.timezone ?? undefined,
        outputKind: activeTab,
        sizeId: activeTab === 'wallpaper' ? wallpaperSizeId : posterSizeId,
        bgColorId,
        skyOptions: {
          ...skyOptions,
          artSet: artSetId,
          ...(activeTab === 'poster' ? { paper: posterPaperId } : {}),
        },
      };
      try {
        const result = await sendPngToChat(canvas, name, initData, WATERMARK, meta);
        if (result.ok) {
          setSent(true);
          setStatus('');
        } else {
          if ('notSubscribed' in result) setSubscribeUrl(result.channelUrl || null);
          setStatus(result.error);
        }
      } catch (err) {
        console.error(err);
        setStatus('Не вдалося надіслати зображення.');
      } finally {
        setSending(false);
        // Bring the response into view — the status/subscribe prompt sit at the
        // page bottom, and the user may have scrolled away while sending. Defer
        // past the render so the (taller) subscribe prompt is laid out first.
        requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
      }
      return;
    }

    try {
      await exportPng(canvas, name);
    } catch (err) {
      console.error(err);
      setStatus('Не вдалося зберегти PNG.');
    }
  };

  // Smooth-scroll to the very bottom of the page. Used after a send-to-chat
  // response so the user sees the status / subscribe prompt even if they scrolled
  // up while the request was in flight. Same smooth-then-fallback trick as
  // scrollOutputIntoView for webviews where `behavior:'smooth'` no-ops.
  const scrollToBottom = () => {
    const toBottom = () =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
      });
    const startY = window.scrollY;
    toBottom();
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - startY) < 2) toBottom();
    }, 350);
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
        <h1>Зоряна карта</h1>
        <p>Небо саме таким, яким воно було у вашу дату й у вашому місці.</p>
      </header>

      <InputForm
        disabled={loading}
        onGenerate={(payload) => {
          // On an explicit "Render", bring the preview into view so the user
          // immediately sees it appear (only here, not on settings re-renders).
          scrollOutputIntoView();
          void handleGenerate(payload, skyOptions, bgColorId, artSetId).then((ok) => {
            // Once painting finishes, reveal the Sky options panel and re-scroll
            // so the panel + canvas settle into view after the layout grows.
            if (!ok) return;
            setSettingsOpen(true);
            requestAnimationFrame(() =>
              requestAnimationFrame(() => scrollOutputIntoView())
            );
          });
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
        <span aria-hidden="true">⚙</span> Налаштування
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
          sent={sent}
          subscribeUrl={subscribeUrl}
          onOpenChannel={() => {
            if (subscribeUrl) void openTelegramLink(subscribeUrl);
          }}
        />
      </div>

      <footer className="app__credits">
        Геокодування — Open-Meteo · Дані про місця © OpenStreetMap contributors
      </footer>
    </main>
  );
}
