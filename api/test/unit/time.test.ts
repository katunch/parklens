import { describe, expect, it } from 'vitest';
import { addDays, dateInTz, formatInTz, isValidDateString, minutesBetween, zonedTimeToUtc } from '../../src/lib/time.js';

const TZ = 'Europe/Zurich';

describe('time helpers', () => {
  it('computes the calendar date in the app time zone around midnight', () => {
    // CEST (UTC+2): 21:59Z is 23:59 local, 22:00Z is 00:00 next day
    expect(dateInTz(new Date('2026-09-29T21:59:59Z'), TZ)).toBe('2026-09-29');
    expect(dateInTz(new Date('2026-09-29T22:00:00Z'), TZ)).toBe('2026-09-30');
    // CET (UTC+1)
    expect(dateInTz(new Date('2026-01-14T22:59:59Z'), TZ)).toBe('2026-01-14');
    expect(dateInTz(new Date('2026-01-14T23:00:00Z'), TZ)).toBe('2026-01-15');
    expect(dateInTz(new Date('2026-01-14T23:00:00Z'), 'UTC')).toBe('2026-01-14');
  });

  it('converts local wall-clock time to UTC (incl. DST)', () => {
    expect(zonedTimeToUtc('2026-09-30', '00:00', TZ).toISOString()).toBe('2026-09-29T22:00:00.000Z');
    expect(zonedTimeToUtc('2026-01-15', '00:00', TZ).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(zonedTimeToUtc('2026-03-29', '12:00', TZ).toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-25', '12:00', TZ).toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-09-29', 60)).toBe('2026-11-28');
  });

  it('validates date strings', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-2-3')).toBe(false);
  });

  it('formats and measures', () => {
    expect(formatInTz(new Date('2026-09-29T12:05:00Z'), TZ)).toBe('2026-09-29 14:05');
    expect(minutesBetween(new Date('2026-09-29T10:00:00Z'), new Date('2026-09-29T11:30:59Z'))).toBe(90);
    expect(minutesBetween(new Date('2026-09-29T11:00:00Z'), new Date('2026-09-29T10:00:00Z'))).toBe(0);
  });
});
