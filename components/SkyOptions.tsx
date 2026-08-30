'use client';

import type { SkyOptions } from '@/lib/sky/types';

interface SkyOptionsProps {
  value: SkyOptions;
  disabled?: boolean;
  onChange: (key: keyof SkyOptions, value: boolean) => void;
}

const ITEMS: { key: keyof SkyOptions; label: string }[] = [
  { key: 'milkyWay', label: 'Milky Way' },
  { key: 'constellations', label: 'Constellations' },
  { key: 'constellationNames', label: 'Constellation names' },
];

/**
 * Shared sky-content toggles applied to BOTH outputs (poster + wallpaper).
 * Changing one re-renders the sky (see StarMapApp), since the toggles change the
 * rendered pixels rather than just the composition.
 */
export default function SkyOptionsControls({
  value,
  disabled,
  onChange,
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
    </fieldset>
  );
}
