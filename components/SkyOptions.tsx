'use client';

import { BG_COLORS } from '@/lib/sky/celestial-config';
import type { SkyOptions } from '@/lib/sky/types';

interface SkyOptionsProps {
  value: SkyOptions;
  bgColorId: string;
  disabled?: boolean;
  onChange: (key: keyof SkyOptions, value: boolean) => void;
  onBgColorChange: (id: string) => void;
}

const ITEMS: { key: keyof SkyOptions; label: string }[] = [
  { key: 'milkyWay', label: 'Milky Way' },
  { key: 'constellations', label: 'Constellations' },
  { key: 'constellationNames', label: 'Constellation names' },
];

const BG_ITEMS: { id: keyof typeof BG_COLORS; label: string }[] = [
  { id: 'space', label: 'Deep space' },
  { id: 'black', label: 'Black' },
];

/**
 * Shared sky-content controls applied to BOTH outputs (poster + wallpaper):
 * three layer toggles and the background colour. Changing any of them re-renders
 * the sky (see StarMapApp) since they change the rendered pixels.
 */
export default function SkyOptionsControls({
  value,
  bgColorId,
  disabled,
  onChange,
  onBgColorChange,
}: SkyOptionsProps) {
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
