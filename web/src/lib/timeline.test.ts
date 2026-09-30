import { describe, expect, it } from 'vitest';
import type { TimelineBucket } from '../api/types';
import { currentBucketIndex, nowPosition, sparkSeries, timelineGeometry, timelineTotals, withLiveOccupancy } from './timeline';

/** 24 buckets starting at 2026-09-29T22:00Z (= local midnight in Zurich, CEST). */
function day(overrides: Partial<Record<number, Partial<TimelineBucket>>> = {}, currentHour = 10): TimelineBucket[] {
  const t0 = Date.parse('2026-09-29T22:00:00Z');
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    start: new Date(t0 + h * 3_600_000).toISOString(),
    entries: 0,
    exits: 0,
    denied: 0,
    occupancy: h <= currentHour ? 0 : null,
    ...overrides[h],
  }));
}

const NOW = new Date('2026-09-30T08:30:00Z'); // 10:30 local

describe('bucket index', () => {
  it('finds the current bucket by start (not by hour label)', () => {
    expect(currentBucketIndex(day(), NOW)).toBe(10);
    expect(nowPosition(day(), NOW)).toBeCloseTo(10.5);
  });

  it('handles a 25-bucket fall-back day where hour 2 repeats', () => {
    const t0 = Date.parse('2026-10-24T22:00:00Z');
    const hours = [0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
    const b: TimelineBucket[] = hours.map((hour, i) => ({
      hour,
      start: new Date(t0 + i * 3_600_000).toISOString(),
      entries: 0,
      exits: 0,
      denied: 0,
      occupancy: 0,
    }));
    // 01:30 UTC on 25 Oct = second 02:xx local (index 3)
    expect(currentBucketIndex(b, new Date('2026-10-25T01:30:00Z'))).toBe(3);
    const g = timelineGeometry(b, new Date('2026-10-25T01:30:00Z'), 40);
    expect(g.bars).toHaveLength(25);
    expect(g.hourLabels.map((l) => l.label)).toEqual(['00', '03', '06', '09', '12', '15', '18', '21']);
  });
});

describe('live occupancy + totals', () => {
  it('patches only the current bucket', () => {
    const b = withLiveOccupancy(day({ 10: { occupancy: 20 } }), NOW, 21);
    expect(b[10]!.occupancy).toBe(21);
    expect(b[9]!.occupancy).toBe(0);
    expect(b[11]!.occupancy).toBeNull();
  });

  it('sums entries, exits and denied', () => {
    expect(timelineTotals(day({ 7: { entries: 5, denied: 1 }, 9: { entries: 2, exits: 3 } }))).toEqual({ entries: 7, exits: 3, denied: 1 });
  });
});

describe('sparkSeries', () => {
  it('starts at the first active bucket or 05:00 and ends now', () => {
    const b = day({ 6: { entries: 23, occupancy: 23 }, 7: { entries: 5, exits: 6, occupancy: 22 } });
    expect(sparkSeries(b, 'entries', NOW)).toEqual([0, 23, 5, 0, 0, 0]);
    expect(sparkSeries(b, 'occupancy', NOW)[2]).toBe(22);
  });
});

describe('timelineGeometry', () => {
  it('draws the occupancy line only up to now and scales to capacity', () => {
    const b = day({ 6: { entries: 23, occupancy: 23 }, 10: { occupancy: 21 } });
    const g = timelineGeometry(b, NOW, 40);
    expect(g.scaleMax).toBe(40);
    expect(g.last!.x).toBeCloseTo(g.xNow);
    expect(g.last!.y).toBeCloseTo(g.yOcc(21));
    expect(g.line.startsWith('M24.0,')).toBe(true);
    expect(g.bars[6]!.inHeight).toBeGreaterThan(0);
  });

  it('never draws exits or entries taller than their half of the chart', () => {
    const g = timelineGeometry(day({ 8: { entries: 99, exits: 99 } }), NOW, 40);
    expect(g.bars[8]!.inHeight).toBeLessThanOrEqual(106 - 18);
    expect(g.bars[8]!.outHeight).toBeLessThanOrEqual(138 - 106);
  });
});
