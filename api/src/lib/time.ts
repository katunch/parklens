/**
 * Time-zone helpers. All "calendar day" logic (today, daily permit validity) goes through
 * these functions using the IANA zone from APP_TIMEZONE, so JS and SQL agree: dates are
 * computed here and passed to SQL as plain 'YYYY-MM-DD' parameters.
 */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, tz: string): WallClock {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out['year'] ?? 0,
    month: out['month'] ?? 1,
    day: out['day'] ?? 1,
    hour: (out['hour'] ?? 0) % 24,
    minute: out['minute'] ?? 0,
    second: out['second'] ?? 0,
  };
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Calendar date ('YYYY-MM-DD') of `instant` in time zone `tz`. */
export function dateInTz(instant: Date, tz: string): string {
  const w = wallClock(instant, tz);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Today's date in `tz`. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return dateInTz(now, tz);
}

/** Local hour (0–23) of `instant` in `tz`. */
export function hourInTz(instant: Date, tz: string): number {
  return wallClock(instant, tz).hour;
}

/** Add `days` calendar days to a 'YYYY-MM-DD' date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when 'YYYY-MM-DD' is a real calendar date. */
export function isValidDateString(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Offset (ms) of `tz` from UTC at `instant`. */
function tzOffsetMs(instant: Date, tz: string): number {
  const w = wallClock(instant, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local wall-clock `date` + `time` ('HH:MM') in `tz`. */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = localAsUtc - tzOffsetMs(new Date(localAsUtc), tz);
  guess = localAsUtc - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** Human-readable 'YYYY-MM-DD HH:MM' in `tz` (used in webhook texts). */
export function formatInTz(instant: Date, tz: string): string {
  const w = wallClock(instant, tz);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}
