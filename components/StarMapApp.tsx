'use client';

import { useEffect, useRef, useState } from 'react';
import InputForm, { type GeneratePayload } from '@/components/InputForm';
import PosterCanvas from '@/components/PosterCanvas';
import { composePoster } from '@/lib/sky/composePoster';
import { exportPng } from '@/lib/sky/exportPng';
import { renderStarMap } from '@/lib/sky/renderStarMap';
import type { Theme } from '@/lib/sky/types';
import { initTelegram } from '@/lib/telegram/bootstrap';
import { DEFAULT_THEME } from '@/lib/telegram/theme';

const SKY_SIZE = 1000;
// TODO(milestone-2): real @channel handle + paid-tier watermark toggle.
const WATERMARK = '@your_channel';
const POSTER_TITLE = 'THE NIGHT SKY';

export default function StarMapApp() {
  const posterRef = useRef<HTMLCanvasElement | null>(null);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [status, setStatus] = useState('Pick a date and place, then render the sky.');
  const [loading, setLoading] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
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
    if (!skyRef.current || !posterRef.current) return;
    setLoading(true);
    setCanDownload(false);
    setStatus('Rendering the sky…');

    try {
      const starMapCanvas = await renderStarMap(skyRef.current, {
        date: payload.date,
        lat: payload.lat,
        lng: payload.lng,
        theme,
        size: SKY_SIZE,
      });

      composePoster(posterRef.current, {
        starMapCanvas,
        title: POSTER_TITLE,
        subtitle: `${payload.displayDate}\n${payload.label}`,
        watermark: WATERMARK,
        theme,
      });

      fileStampRef.current = payload.fileStamp;
      setCanDownload(true);
      setStatus('Ready — download your poster.');
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
    if (!posterRef.current) return;
    const name = fileStampRef.current ? `star-map-${fileStampRef.current}` : 'star-map';
    try {
      await exportPng(posterRef.current, name);
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
        skyRef={skyRef}
        formRef={formRef}
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
