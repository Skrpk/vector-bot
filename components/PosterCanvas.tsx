'use client';

import type { RefObject } from 'react';

interface PosterCanvasProps {
  /** Visible poster (composed output). */
  posterRef: RefObject<HTMLCanvasElement | null>;
  /** Off-screen container d3-celestial renders its own canvas into. */
  skyRef: RefObject<HTMLDivElement | null>;
  /** Off-screen sibling where d3-celestial injects its hidden date/lat/lon inputs. */
  formRef: RefObject<HTMLDivElement | null>;
  status: string;
  canDownload: boolean;
  onDownload: () => void;
}

/**
 * Hosts the visible poster <canvas> plus the off-screen d3-celestial container
 * and its required sibling form. The UI never touches d3-celestial directly —
 * StarMapApp drives lib/sky against these refs.
 */
export default function PosterCanvas({
  posterRef,
  skyRef,
  formRef,
  status,
  canDownload,
  onDownload,
}: PosterCanvasProps) {
  return (
    <div className="poster">
      <canvas
        ref={posterRef}
        className="poster__canvas"
        width={1080}
        height={1350}
        aria-label="Star map poster preview"
      />

      <p className="poster__status">{status}</p>

      <button
        className="btn btn--ghost"
        type="button"
        onClick={onDownload}
        disabled={!canDownload}
      >
        Download PNG
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
