'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoResult } from '@/lib/geo/types';

const DEBOUNCE_MS = 350;
const MIN_LEN = 2;

/** "City, Region, Country" — disambiguates the many same-named places. */
export function placeLabel(r: GeoResult): string {
  return [r.name, r.admin, r.country].filter(Boolean).join(', ');
}

interface CitySearchProps {
  onSelect: (place: GeoResult, label: string) => void;
  disabled?: boolean;
}

// TODO: reverse geocoding / "use my location" (GPS) as a later nicety.
export default function CitySearch({ onSelect, disabled }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const skipNextRef = useRef(false); // suppress the fetch triggered by selecting
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Debounced search: one request fires ~350ms after typing stops, and a newer
  // query aborts the in-flight one — no per-keystroke hammering. All state updates
  // happen inside the timeout (never synchronously in the effect body).
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const q = query.trim();

    const timer = setTimeout(async () => {
      if (q.length < MIN_LEN) {
        setResults([]);
        setNoResults(false);
        setOpen(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setOpen(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=6`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as { results?: GeoResult[] };
        const list = data.results ?? [];
        setResults(list);
        setNoResults(list.length === 0);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setResults([]);
        setNoResults(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleSelect = (r: GeoResult) => {
    const label = placeLabel(r);
    skipNextRef.current = true; // don't re-search for the label we just set
    setQuery(label);
    setResults([]);
    setOpen(false);
    onSelect(r, label);
  };

  return (
    <div className="citysearch" ref={rootRef}>
      <input
        type="text"
        autoComplete="off"
        placeholder="Пошук міста — напр. Київ"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {open && (
        <ul className="citysearch__list">
          {loading && <li className="citysearch__msg">Пошук…</li>}
          {!loading && noResults && (
            <li className="citysearch__msg">Нічого не знайдено.</li>
          )}
          {!loading &&
            results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button
                  type="button"
                  className="citysearch__item"
                  // onMouseDown (not onClick) so selection beats input blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(r);
                  }}
                >
                  {placeLabel(r)}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
