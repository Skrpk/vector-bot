'use client';

import { useState } from 'react';
import AboutArt from '@/components/AboutArt';
import { BG_COLORS } from '@/lib/sky/celestial-config';
import { ART_SETS } from '@/lib/sky/constellation-art';
import type { SkyOptions } from '@/lib/sky/types';

interface SkyOptionsProps {
  value: SkyOptions;
  bgColorId: string;
  artSetId: string;
  disabled?: boolean;
  onChange: (key: keyof SkyOptions, value: boolean) => void;
  onBgColorChange: (id: string) => void;
  onArtSetChange: (id: string) => void;
}

const ITEMS: { key: keyof SkyOptions; label: string }[] = [
  ...(ART_SETS.length > 0
    ? [{ key: 'constellationArt' as const, label: 'Ілюстрації сузір’їв' }]
    : []),
  { key: 'milkyWay', label: 'Чумацький Шлях' },
  { key: 'constellations', label: 'Сузір’я' },
  { key: 'constellationNames', label: 'Назви сузір’їв' },
];

const BG_ITEMS: { id: keyof typeof BG_COLORS; label: string }[] = [
  { id: 'space', label: 'Космос' },
  { id: 'black', label: 'Чорний' },
];

/**
 * Shared sky-content controls applied to BOTH outputs (poster + wallpaper):
 * layer toggles, background colour, and the illustration set. Changing any of
 * them re-renders the sky (see StarMapApp) since they change the rendered pixels.
 */
export default function SkyOptionsControls({
  value,
  bgColorId,
  artSetId,
  disabled,
  onChange,
  onBgColorChange,
  onArtSetChange,
}: SkyOptionsProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const showArtSets = value.constellationArt && ART_SETS.length > 1;

  return (
    <>
      <fieldset className="skyopts" disabled={disabled}>
        <legend className="skyopts__legend">Налаштування неба</legend>

        <div className="skyopts__row">
          {ITEMS.map(({ key, label }) => (
            <label key={key} className="skyopts__item">
              <input
                type="checkbox"
                checked={value[key]}
                onChange={(e) => onChange(key, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {value.constellationArt && (
          <button
            type="button"
            className="skyopts__about"
            onClick={() => setAboutOpen(true)}
          >
            <span aria-hidden="true">ⓘ</span> Про ілюстрації сузір’їв
          </button>
        )}

        {showArtSets && (
          <div className="skyopts__bg">
            <span className="skyopts__bg-label">Стиль ілюстрацій</span>
            <div className="sizes" role="group" aria-label="Набір ілюстрацій">
              {ART_SETS.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  aria-pressed={artSetId === set.id}
                  className={`sizes__opt${artSetId === set.id ? ' sizes__opt--active' : ''}`}
                  onClick={() => onArtSetChange(set.id)}
                >
                  {set.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="skyopts__bg">
          <span className="skyopts__bg-label">Тло</span>
          <div className="sizes" role="group" aria-label="Колір тла">
            {BG_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={bgColorId === id}
                className={`sizes__opt${bgColorId === id ? ' sizes__opt--active' : ''}`}
                onClick={() => onBgColorChange(id)}
              >
                <span
                  className="skyopts__swatch"
                  style={{ background: BG_COLORS[id] }}
                  aria-hidden="true"
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <AboutArt open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
