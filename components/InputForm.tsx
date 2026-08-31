'use client';

import { useState } from 'react';
import CitySearch from '@/components/CitySearch';
import type { GeoResult } from '@/lib/geo/types';
import { resolveInstant } from '@/lib/time/localToUtc';

export interface GeneratePayload {
  /** Absolute UTC instant to render (already timezone-resolved). */
  date: Date;
  /** Poster/wallpaper heading (may be empty). */
  title: string;
  lat: number;
  lng: number;
  /** Place label for the poster subtitle ("City, Region, Country"). */
  label: string;
  /** IANA timezone of the chosen place. */
  timezone: string | null;
  /** The entered wall-clock time, formatted for display on the poster. */
  displayDate: string;
  /** Entered calendar date (YYYY-MM-DD) for the export filename. */
  fileStamp: string;
}

interface SelectedLocation {
  lat: number;
  lng: number;
  timezone: string | null;
  label: string;
}

interface InputFormProps {
  disabled?: boolean;
  onGenerate: (payload: GeneratePayload) => void;
}

const DEFAULT_TITLE = 'ДЕНЬ НАРОДЖЕННЯ';

function defaultDateTimeLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Format the entered wall-clock (as typed, local to the place) for display. */
function formatDisplayDate(wall: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return wall;
  const [, y, mo, d, h, mi] = m.map(Number);
  const dt = new Date(y, mo - 1, d, h, mi); // local construction = shows typed numbers
  return new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dt);
}

export default function InputForm({ disabled, onGenerate }: InputFormProps) {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [dateTime, setDateTime] = useState(defaultDateTimeLocal);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCitySelect = (place: GeoResult, label: string) => {
    setError(null);
    setLocation({
      lat: place.lat,
      lng: place.lng,
      timezone: place.timezone,
      label,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location) {
      setError('Спершу знайдіть місто та оберіть його зі списку.');
      return;
    }

    const instant = resolveInstant(dateTime, location.timezone);
    if (!instant || Number.isNaN(instant.getTime())) {
      setError('Оберіть коректну дату й час.');
      return;
    }

    onGenerate({
      date: instant,
      title: title.trim(),
      lat: location.lat,
      lng: location.lng,
      label: location.label,
      timezone: location.timezone,
      displayDate: formatDisplayDate(dateTime),
      fileStamp: dateTime.slice(0, 10),
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form__field">
        <label htmlFor="title">Заголовок</label>
        <input
          id="title"
          type="text"
          placeholder="напр. ВЕСІЛЛЯ💍"
          value={title}
          maxLength={40}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="form__field">
        <label htmlFor="date">Дата й час</label>
        <input
          id="date"
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
        />
      </div>

      <div className="form__field">
        <label htmlFor="citysearch-input">
          Місце (введіть місто й оберіть зі списку)
        </label>
        <CitySearch onSelect={handleCitySelect} disabled={disabled} />
      </div>

      {error && <p className="form__error">{error}</p>}

      <button className="btn btn--primary" type="submit" disabled={disabled}>
        {disabled ? 'Малюємо…' : 'Створити зоряну карту'}
      </button>
    </form>
  );
}
