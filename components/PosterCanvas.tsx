'use client';

import type { RefObject } from 'react';

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
  status: string;
  canDownload: boolean;
  onDownload: () => void;
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
  status,
  canDownload,
  onDownload,
}: PosterCanvasProps) {
  return (
    <div className="poster">
      <div className="tabs" role="tablist" aria-label="Output type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'poster'}
          className={`tabs__tab${activeTab === 'poster' ? ' tabs__tab--active' : ''}`}
          onClick={() => onTabChange('poster')}
        >
          Poster
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'wallpaper'}
          className={`tabs__tab${activeTab === 'wallpaper' ? ' tabs__tab--active' : ''}`}
          onClick={() => onTabChange('wallpaper')}
        >
          Wallpaper
        </button>
      </div>

      <div className="poster__stage">
        <canvas
          ref={posterRef}
          className="poster__canvas"
          width={1080}
          height={1350}
          aria-label="Star map poster preview"
          hidden={activeTab !== 'poster'}
        />
        <canvas
          ref={wallpaperRef}
          className="wallpaper__canvas"
          width={1290}
          height={2796}
          aria-label="Star map wallpaper preview"
          hidden={activeTab !== 'wallpaper'}
        />
      </div>

      {activeTab === 'wallpaper' && (
        <p className="poster__note">
          {1290}×{2796} · full-bleed stars · white text — set it as your iPhone wallpaper.
        </p>
      )}

      <p className="poster__status">{status}</p>

      <button
        className="btn btn--ghost"
        type="button"
        onClick={onDownload}
        disabled={!canDownload}
      >
        Download {activeTab === 'wallpaper' ? 'wallpaper' : 'poster'} PNG
      </button>

      {/* Off-screen d3-celestial mount. #celestial-map + sibling #celestial-form
          must both exist; see renderStarMap's DOM contract. */}
      <div className="sky-offscreen" aria-hidden="true">
        <div id="celestial-map" ref={skyRef} />
        <div id="celestial-form" ref={formRef} />
      </div>
    </div>
  );
}
