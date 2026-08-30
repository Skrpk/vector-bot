'use client';

import { useEffect } from 'react';

const SOURCE_URL =
  'https://github.com/Stellarium/stellarium/tree/master/skycultures/modern';
const LICENSE_URL = 'https://artlibre.org/licence/lal/en/';

interface AboutArtProps {
  open: boolean;
  onClose: () => void;
}

/** Attribution modal for the constellation illustrations (Free Art License 1.3). */
export default function AboutArt({ open, onClose }: AboutArtProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" role="presentation" onClick={onClose}>
      <div
        className="modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-art-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="about-art-title" className="modal__title">
          Constellation illustrations
        </h2>

        <p className="modal__meta">Original artwork by Johan Meuris</p>
        <p className="modal__meta">Source: Stellarium — Modern sky culture</p>
        <p className="modal__meta">Licensed under the Free Art License 1.3</p>

        <p className="modal__body">
          Artwork has been modified by VECTOR for projection onto personalized star maps.
          The modified constellation artwork remains available under the Free Art License
          1.3.
        </p>

        <p className="modal__links">
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            Original source
          </a>
          <span aria-hidden="true"> · </span>
          <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
            Free Art License
          </a>
        </p>
      </div>
    </div>
  );
}
