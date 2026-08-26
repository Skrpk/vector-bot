'use client';

import { useState } from 'react';
import CitySearch from '@/components/CitySearch';
import { parseCoords } from '@/lib/geocode';
import type { GeoResult } from '@/lib/geo/types';
import { resolveInstant } from '@/lib/time/localToUtc';

export interface GeneratePayload {
  /** Absolute UTC instant to render (already timezone-resolved). */
  date: Date;
  lat: number;
  lng: number;
  /** Place label for the poster subtitle ("City, Region, Country" or coords). */
  label: string;
  /** IANA timezone if known, else null (manual coords → time treated as UTC). */
  timezone: string | null;
  /** The entered wall-clock time, formatted for display on the poster. */
  displayDate: string;
  /** Entered calendar date (YYYY-MM-DD) for the export filename. */
  fileStamp: string;
}

/** A resolved location, from either city search or manual coordinates. */
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
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(dt);
}

export default function InputForm({ disabled, onGenerate }: InputFormProps) {
  const [dateTime, setDateTime] = useState(defaultDateTimeLocal);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCoords, setManualCoords] = useState('');
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

  const applyManual = () => {
    setError(null);
    const parsed = parseCoords(manualCoords);
    if (!parsed) {
      setError('Enter coordinates as "lat, lng" — e.g. 50.08, 14.44.');
      return;
    }
    setLocation({
      lat: parsed.lat,
      lng: parsed.lng,
      timezone: null, // unknown → time treated as UTC
      label: parsed.label,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location) {
      setError('Search for a city or enter coordinates first.');
      return;
    }

    const instant = resolveInstant(dateTime, location.timezone);
    if (!instant || Number.isNaN(instant.getTime())) {
      setError('Please choose a valid date and time.');
      return;
    }

    onGenerate({
      date: instant,
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
        <label htmlFor="date">Date &amp; time</label>
        <input
          id="date"
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
        />
      </div>

      <div className="form__field">
        <label htmlFor="citysearch-input">Place</label>
        <CitySearch onSelect={handleCitySelect} disabled={disabled} />
        <p className="form__hint">
          Type a city and pick from the list — its timezone is used so the sky matches
          your local time.
        </p>
      </div>

      {location && (
        <p className="form__selected">
          {location.label}
          {location.timezone ? (
            <span className="form__tz"> · {location.timezone}</span>
          ) : (
            <span className="form__tz"> · time interpreted as UTC</span>
          )}
        </p>
      )}

      <div className="form__manual">
        <button
          type="button"
          className="form__manual-toggle"
          aria-expanded={manualOpen}
          onClick={() => setManualOpen((v) => !v)}
        >
          {manualOpen ? '▾' : '▸'} Enter coordinates manually
        </button>

        {manualOpen && (
          <div className="form__manual-body">
            <input
              type="text"
              inputMode="text"
              placeholder="50.0880, 14.4208"
              value={manualCoords}
              onChange={(e) => setManualCoords(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={applyManual}
            >
              Use coordinates
            </button>
            <p className="form__hint">
              No timezone for raw coordinates — the time above is treated as UTC.
            </p>
          </div>
        )}
      </div>

      {error && <p className="form__error">{error}</p>}

      <button className="btn btn--primary" type="submit" disabled={disabled}>
        {disabled ? 'Rendering…' : 'Render star map'}
      </button>
    </form>
  );
}
