/**
 * Date / time / duration formatting (UX §2.2). Every function takes the app locale and the app
 * timezone explicitly, so nothing depends on the browser's timezone.
 */

export type AppLanguage = 'en' | 'de';
export const DEFAULT_TIMEZONE = 'Europe/Zurich';

export function localeFor(lang: string): 'en-GB' | 'de-CH' {
  return lang.startsWith('de') ? 'de-CH' : 'en-GB';
}

type DateStyle = 'dateTime' | 'date' | 'dateWeekday' | 'time' | 'timeSeconds';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function dateOptions(locale: string, style: DateStyle): Intl.DateTimeFormatOptions {
  const de = locale.startsWith('de');
  const day: Intl.DateTimeFormatOptions = de
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  switch (style) {
    case 'dateTime':
      return { ...day, ...time };
    case 'date':
      return day;
    case 'dateWeekday':
      return { ...day, weekday: 'short' };
    case 'time':
      return time;
    case 'timeSeconds':
      return { ...time, second: '2-digit' };
  }
}

function formatter(locale: string, timeZone: string, style: DateStyle): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${style}`;
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...dateOptions(locale, style), timeZone });
    } catch {
      f = new Intl.DateTimeFormat(locale, { ...dateOptions(locale, style), timeZone: DEFAULT_TIMEZONE });
    }
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Current ICU spells September "Sept" in en-GB; the UX spec (and every other month) uses three
 * letters, so keep "Sep" for consistent column widths.
 */
function tidy(text: string, locale: string): string {
  return locale.startsWith('en') ? text.replace(/\bSept\b/, 'Sep') : text;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Format an instant (ISO string or Date) in the app timezone. */
export function formatInstant(value: string | Date, style: DateStyle, locale: string, timeZone: string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return tidy(formatter(locale, timeZone, style).format(d), locale);
}

/**
 * Format a calendar date (`YYYY-MM-DD`). It is parsed as UTC midnight and formatted in UTC, so
 * it never shifts by a day.
 */
export function formatCalendarDate(ymd: string, locale: string, weekday = false): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return tidy(formatter(locale, 'UTC', weekday ? 'dateWeekday' : 'date').format(d), locale);
}

/** Calendar date (`YYYY-MM-DD`) of an instant in a timezone. */
export function ymdInTz(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  }
}

/** Today in the app timezone as `YYYY-MM-DD`. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  return ymdInTz(now, timeZone);
}

/** Add calendar days to a `YYYY-MM-DD` date. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type RelativeParts =
  | { kind: 'justNow' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'today'; time: string }
  | { kind: 'yesterday'; time: string }
  | { kind: 'dateTime'; dateTime: string };

/** Decide which relative-time wording applies (UX §2.2 RelativeTime). */
export function relativeParts(value: string | Date, now: Date, locale: string, timeZone: string): RelativeParts {
  const d = toDate(value);
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 45_000) return { kind: 'justNow' };
  if (diffMs < 3_600_000) return { kind: 'minutes', minutes: Math.max(1, Math.round(diffMs / 60_000)) };
  const day = ymdInTz(d, timeZone);
  const today = ymdInTz(now, timeZone);
  const time = formatInstant(d, 'time', locale, timeZone);
  if (day === today) return { kind: 'today', time };
  if (day === addDays(today, -1)) return { kind: 'yesterday', time };
  return { kind: 'dateTime', dateTime: formatInstant(d, 'dateTime', locale, timeZone) };
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

/** "5 min ago" / "vor 5 Min." */
export function formatMinutesAgo(minutes: number, locale: string): string {
  let rtf = rtfCache.get(locale);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    rtfCache.set(locale, rtf);
  }
  return rtf.format(-minutes, 'minute');
}

export type DurationParts =
  | { key: 'minutes'; minutes: number }
  | { key: 'hours'; hours: number }
  | { key: 'hoursMinutes'; hours: number; minutes: number }
  | { key: 'days'; days: number }
  | { key: 'daysHours'; days: number; hours: number };

/** Split a duration in minutes into the i18n key + values (`common.duration.*`). */
export function durationParts(totalMinutes: number): DurationParts {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return { key: 'minutes', minutes: m };
  if (m < 24 * 60) {
    const hours = Math.floor(m / 60);
    const minutes = m % 60;
    return minutes === 0 ? { key: 'hours', hours } : { key: 'hoursMinutes', hours, minutes };
  }
  const days = Math.floor(m / (24 * 60));
  const hours = Math.floor((m % (24 * 60)) / 60);
  return hours === 0 ? { key: 'days', days } : { key: 'daysHours', days, hours };
}

/** Minutes between an ISO instant and now (never negative). */
export function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}

/** Value for `<input type="datetime-local">` → ISO string (browser local time, as typed). */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
