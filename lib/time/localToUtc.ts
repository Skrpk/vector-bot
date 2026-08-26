// Convert a wall-clock time in a given IANA timezone to the correct absolute
// (UTC) instant, using the platform's built-in Intl + tzdata — no date library.
//
// This is the load-bearing correctness fix for the star map: the sky depends on
// the absolute UT instant, and the user enters a *local* wall-clock time. Getting
// this wrong rotates the whole sky.

/**
 * Offset, in ms, between the given IANA zone's wall clock and UTC at instant
 * `at` — i.e. (wallclock_in_zone − utc). DST-aware because it asks Intl for the
 * zone's actual rendered time at that instant.
 */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - at.getTime();
}

/**
 * Interpret (y, mo[1-12], d, h, mi) as a wall clock in `timeZone` and return the
 * matching UTC instant. Uses offset inversion with one DST-refinement pass, which
 * resolves correctly except inside the ~1h "spring forward" gap (there we keep the
 * first estimate — acceptable for a star-map time picker).
 */
export function zonedWallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMs(timeZone, new Date(guess));
  let utc = guess - off1;
  const off2 = tzOffsetMs(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** Parse a `datetime-local` value ("YYYY-MM-DDTHH:mm") into wall-clock parts. */
function parseWall(
  wall: string
): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: Number(m[4]),
    mi: Number(m[5]),
  };
}

/**
 * Resolve a `datetime-local` string to the absolute UTC instant to render.
 *
 * - With an IANA `timezone` (a city was chosen): interpret the wall clock in that
 *   zone — the correct behaviour.
 * - Without one (manual coordinates): interpret the wall clock as **UTC**. This is
 *   the documented fallback; the UI notes it.
 *
 * Returns null if the input can't be parsed.
 */
export function resolveInstant(wall: string, timezone: string | null): Date | null {
  const p = parseWall(wall);
  if (!p) return null;
  if (timezone) {
    return zonedWallClockToUtc(p.y, p.mo, p.d, p.h, p.mi, timezone);
  }
  // Manual fallback: entered time is treated as UTC.
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi));
}
