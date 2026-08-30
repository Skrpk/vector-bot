'use client';

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
  { key: 'milkyWay', label: 'Milky Way' },
  { key: 'constellations', label: 'Constellations' },
  { key: 'constellationNames', label: 'Constellation names' },
  ...(ART_SETS.length > 0
    ? [{ key: 'constellationArt' as const, label: 'Constellation art' }]
    : []),
];

const BG_ITEMS: { id: keyof typeof BG_COLORS; label: string }[] = [
  { id: 'space', label: 'Deep space' },
  { id: 'black', label: 'Black' },
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
  const showArtSets = value.constellationArt && ART_SETS.length > 1;

  return (
    <fieldset className="skyopts" disabled={disabled}>
      <legend className="skyopts__legend">Sky options</legend>

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

      {showArtSets && (
        <div className="skyopts__bg">
          <span className="skyopts__bg-label">Art style</span>
          <div className="sizes" role="group" aria-label="Illustration set">
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
        <span className="skyopts__bg-label">Background</span>
        <div className="sizes" role="group" aria-label="Background colour">
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
  );
}
