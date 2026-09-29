import { describe, expect, it } from 'vitest';
import {
  addDays,
  durationParts,
  formatCalendarDate,
  formatInstant,
  localeFor,
  relativeParts,
  todayInTz,
} from './format';

const ZH = 'Europe/Zurich';

describe('localeFor', () => {
  it('maps the UI language to en-GB / de-CH', () => {
    expect(localeFor('en')).toBe('en-GB');
    expect(localeFor('de')).toBe('de-CH');
    expect(localeFor('de-CH')).toBe('de-CH');
  });
});

describe('formatInstant (app timezone, not browser timezone)', () => {
  // 06:12 UTC = 08:12 in Zurich (CEST, UTC+2)
  const iso = '2026-09-29T06:12:05Z';

  it('formats en-GB and de-CH as specified in UX §2.2', () => {
    expect(formatInstant(iso, 'dateTime', 'en-GB', ZH)).toBe('29 Sep 2026, 08:12');
    expect(formatInstant(iso, 'dateTime', 'de-CH', ZH)).toBe('29.09.2026, 08:12');
    expect(formatInstant(iso, 'date', 'en-GB', ZH)).toBe('29 Sep 2026');
    expect(formatInstant(iso, 'date', 'de-CH', ZH)).toBe('29.09.2026');
    expect(formatInstant(iso, 'time', 'de-CH', ZH)).toBe('08:12');
    expect(formatInstant(iso, 'timeSeconds', 'en-GB', ZH)).toBe('08:12:05');
  });

  it('uses the given timezone', () => {
    expect(formatInstant(iso, 'time', 'en-GB', 'UTC')).toBe('06:12');
    expect(formatInstant('2026-09-29T23:30:00Z', 'date', 'en-GB', ZH)).toBe('30 Sep 2026');
  });
});

describe('formatCalendarDate', () => {
  it('never shifts a YYYY-MM-DD date by a day', () => {
    expect(formatCalendarDate('2026-09-30', 'en-GB')).toBe('30 Sep 2026');
    expect(formatCalendarDate('2026-09-30', 'de-CH')).toBe('30.09.2026');
    expect(formatCalendarDate('2026-01-01', 'en-GB')).toBe('1 Jan 2026');
  });

  it('adds the weekday for day permits', () => {
    expect(formatCalendarDate('2026-09-29', 'en-GB', true)).toBe('Tue, 29 Sep 2026');
    expect(formatCalendarDate('2026-09-29', 'de-CH', true)).toMatch(/^Di\.?, 29\.09\.2026$/);
  });
});

describe('todayInTz / addDays', () => {
  it('returns the calendar date in the app timezone', () => {
    // 23:30 UTC on 29 Sep is already 30 Sep in Zurich
    expect(todayInTz(ZH, new Date('2026-09-29T23:30:00Z'))).toBe('2026-09-30');
    expect(todayInTz('UTC', new Date('2026-09-29T23:30:00Z'))).toBe('2026-09-29');
  });

  it('adds calendar days across month ends', () => {
    expect(addDays('2026-09-29', 60)).toBe('2026-11-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('relativeParts', () => {
  const now = new Date('2026-09-29T10:00:00Z'); // 12:00 in Zurich

  it('covers just now / minutes / today / yesterday / older', () => {
    expect(relativeParts('2026-09-29T09:59:30Z', now, 'en-GB', ZH)).toEqual({ kind: 'justNow' });
    expect(relativeParts('2026-09-29T09:55:00Z', now, 'en-GB', ZH)).toEqual({ kind: 'minutes', minutes: 5 });
    expect(relativeParts('2026-09-29T06:12:00Z', now, 'en-GB', ZH)).toEqual({ kind: 'today', time: '08:12' });
    expect(relativeParts('2026-09-28T17:02:00Z', now, 'en-GB', ZH)).toEqual({ kind: 'yesterday', time: '19:02' });
    expect(relativeParts('2026-09-20T17:02:00Z', now, 'de-CH', ZH)).toEqual({ kind: 'dateTime', dateTime: '20.09.2026, 19:02' });
  });
});

describe('durationParts', () => {
  it('picks minutes, hours, days as in UX §2.2', () => {
    expect(durationParts(0)).toEqual({ key: 'minutes', minutes: 0 });
    expect(durationParts(40)).toEqual({ key: 'minutes', minutes: 40 });
    expect(durationParts(120)).toEqual({ key: 'hours', hours: 2 });
    expect(durationParts(134)).toEqual({ key: 'hoursMinutes', hours: 2, minutes: 14 });
    expect(durationParts(24 * 60)).toEqual({ key: 'days', days: 1 });
    expect(durationParts(2 * 24 * 60 + 185)).toEqual({ key: 'daysHours', days: 2, hours: 3 });
  });
});
