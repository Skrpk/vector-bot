'use client';

import { useState } from 'react';
import { formatCoords, geocode } from '@/lib/geocode';

export interface GeneratePayload {
  date: Date;
  lat: number;
  lng: number;
  /** Human-readable coordinate label for the poster subtitle. */
  label: string;
}

interface InputFormProps {
  disabled?: boolean;
  onGenerate: (payload: GeneratePayload) => void;
}

/** Default: now, New York City. Gives a one-click first render. */
function defaultDateTimeLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function InputForm({ disabled, onGenerate }: InputFormProps) {
  const [dateTime, setDateTime] = useState(defaultDateTimeLocal);
  const [location, setLocation] = useState('40.7128, -74.0060');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) {
      setError('Please choose a valid date and time.');
      return;
    }

    // TODO(milestone-2): replace this stub with a real geocoder so users can
    // type a place name instead of coordinates.
    const geo = geocode(location);
    if (!geo) {
      setError('Enter coordinates as "lat, lng" — e.g. 40.7128, -74.0060.');
      return;
    }

    onGenerate({
      date,
      lat: geo.lat,
      lng: geo.lng,
      label: formatCoords(geo.lat, geo.lng),
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form__field">
        <label htmlFor="date">Date &amp; time</label>
        <input
          id="date"
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
        />
      </div>

      <div className="form__field">
        <label htmlFor="location">Location (latitude, longitude)</label>
        <input
          id="location"
          type="text"
          inputMode="text"
          placeholder="40.7128, -74.0060"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <p className="form__hint">
          Coordinates only for now — place-name search is coming later.
        </p>
      </div>

      {error && <p className="form__error">{error}</p>}

      <button className="btn btn--primary" type="submit" disabled={disabled}>
        {disabled ? 'Rendering…' : 'Render star map'}
      </button>
    </form>
  );
}
