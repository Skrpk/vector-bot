'use client';

import type { RefObject } from 'react';
import { POSTER_PAPERS, POSTER_SIZES } from '@/lib/sky/composePoster';
import { WALLPAPER_SIZES } from '@/lib/sky/composeWallpaper';

export type OutputTab = 'poster' | 'wallpaper';

interface PosterCanvasProps {
  /** Visible poster (composed output). */
  posterRef: RefObject<HTMLCanvasElement | null>;
  /** Visible wallpaper (composed output). */
  wallpaperRef: RefObject<HTMLCanvasElement | null>;
  /** Off-screen container d3-celestial renders its own canvas into. */
  skyRef: RefObject<HTMLDivElement | null>;
  /** Off-screen sibling where d3-celestial injects its hidden date/lat/lon inputs. */
  formRef: RefObject<HTMLDivElement | null>;
  activeTab: OutputTab;
  onTabChange: (tab: OutputTab) => void;
  posterSizeId: string;
  onPosterSizeChange: (id: string) => void;
  posterPaperId: string;
  onPosterPaperChange: (id: string) => void;
  wallpaperSizeId: string;
  onWallpaperSizeChange: (id: string) => void;
  status: string;
  /** A sky render is in flight — show a loading overlay on the canvas. */
  loading: boolean;
  canDownload: boolean;
  onDownload: () => void;
  /** Inside Telegram the button sends the image to the chat, not a download. */
  inTelegram: boolean;
  /** A send-to-chat request is in flight (Telegram only). */
  sending: boolean;
}

/**
 * Hosts the two composed outputs (Poster / Wallpaper) behind tabs, plus the
 * off-screen d3-celestial container and its required sibling form. Both canvases
 * stay mounted so switching tabs never re-renders; the inactive one is hidden.
 * The UI never touches d3-celestial directly — StarMapApp drives lib/sky.
 */
export default function PosterCanvas({
  posterRef,
  wallpaperRef,
  skyRef,
  formRef,
  activeTab,
  onTabChange,
  posterSizeId,
  onPosterSizeChange,
  posterPaperId,
  onPosterPaperChange,
  wallpaperSizeId,
  onWallpaperSizeChange,
  status,
  loading,
  canDownload,
  onDownload,
  inTelegram,
  sending,
}: PosterCanvasProps) {
  const kind = activeTab === 'wallpaper' ? 'wallpaper' : 'poster';
  const label = inTelegram
    ? sending
      ? 'Sending…'
      : `Send ${kind} to chat`
    : `↓ Download ${kind} PNG`;
  return (
    <div className="poster">
      <div className="tabs" role="tablist" aria-label="Output type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'wallpaper'}
          className={`tabs__tab${activeTab === 'wallpaper' ? ' tabs__tab--active' : ''}`}
          onClick={() => onTabChange('wallpaper')}
        >
          Wallpaper
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'poster'}
          className={`tabs__tab${activeTab === 'poster' ? ' tabs__tab--active' : ''}`}
          onClick={() => onTabChange('poster')}
        >
          Poster
        </button>
      </div>

      {activeTab === 'poster' && (
        <>
          <div className="sizes" role="group" aria-label="Poster size">
            {POSTER_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={posterSizeId === size.id}
                className={`sizes__opt${
                  posterSizeId === size.id ? ' sizes__opt--active' : ''
                }`}
                onClick={() => onPosterSizeChange(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>
          <div className="sizes" role="group" aria-label="Poster paper">
            {POSTER_PAPERS.map((paper) => (
              <button
                key={paper.id}
                type="button"
                aria-pressed={posterPaperId === paper.id}
                className={`sizes__opt${
                  posterPaperId === paper.id ? ' sizes__opt--active' : ''
                }`}
                onClick={() => onPosterPaperChange(paper.id)}
              >
                <span
                  className="skyopts__swatch"
                  style={{ background: paper.bg }}
                  aria-hidden="true"
                />
                {paper.label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === 'wallpaper' && (
        <div className="sizes" role="group" aria-label="Wallpaper aspect ratio">
          {WALLPAPER_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              aria-pressed={wallpaperSizeId === size.id}
              className={`sizes__opt${
                wallpaperSizeId === size.id ? ' sizes__opt--active' : ''
              }`}
              onClick={() => onWallpaperSizeChange(size.id)}
              title={`${size.w}×${size.h}`}
            >
              {size.label}
            </button>
          ))}
        </div>
      )}

      <div className="poster__stage">
        <canvas
          ref={posterRef}
          className="poster__canvas"
          width={POSTER_SIZES[0].w}
          height={POSTER_SIZES[0].h}
          aria-label="Star map poster preview"
          hidden={activeTab !== 'poster'}
        />
        <canvas
          ref={wallpaperRef}
          className="wallpaper__canvas"
          width={WALLPAPER_SIZES[2].w}
          height={WALLPAPER_SIZES[2].h}
          aria-label="Star map wallpaper preview"
          hidden={activeTab !== 'wallpaper'}
        />

        {/* Loading overlay drawn on top of the in-progress canvas, so a user who
            has scrolled to the preview sees that a render is underway. */}
        {loading && (
          <div className="canvas-loader" role="status" aria-live="polite">
            <span className="canvas-loader__spinner" aria-hidden="true" />
            <span className="canvas-loader__text">Rendering the sky…</span>
          </div>
        )}
      </div>

      {activeTab === 'wallpaper' && (
        <p className="poster__note">
          Full-bleed stars · white text — pick your phone&apos;s aspect ratio and set it
          as your wallpaper.
        </p>
      )}

      <p className="poster__status">{status}</p>

      {/* Floating gold action bar — only present once an output is ready.
          Downloads in a browser; sends the image to the chat inside Telegram. */}
      {canDownload && (
        <div className="download-bar">
          <button
            className="btn btn--download"
            type="button"
            onClick={onDownload}
            disabled={sending}
          >
            {label}
          </button>
        </div>
      )}

      {/* Off-screen d3-celestial mount. #celestial-map + sibling #celestial-form
          must both exist; see renderStarMap's DOM contract. */}
      <div className="sky-offscreen" aria-hidden="true">
        <div id="celestial-map" ref={skyRef} />
        <div id="celestial-form" ref={formRef} />
      </div>
    </div>
  );
}
