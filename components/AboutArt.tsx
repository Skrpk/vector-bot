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
          aria-label="Закрити"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="about-art-title" className="modal__title">
          Ілюстрації сузір’їв
        </h2>

        <p className="modal__meta">Оригінальні ілюстрації — Johan Meuris</p>
        <p className="modal__meta">Джерело: Stellarium — Modern sky culture</p>
        <p className="modal__meta">Ліцензія Free Art License 1.3</p>

        <p className="modal__body">
          Ілюстрації змінено командою VECTOR для проєкції на персональні зоряні карти.
          Змінені ілюстрації сузір’їв залишаються доступними за ліцензією Free Art License
          1.3.
        </p>

        <p className="modal__links">
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            Оригінальне джерело
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
