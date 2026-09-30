import { describe, expect, it } from 'vitest';
import { normalizePlate } from '../../src/lib/plate.js';
import { dateInTz, zonedTimeToUtc } from '../../src/lib/time.js';
import { demoClock } from '../../src/seed.js';
import { DEMO_DAY_END_MIN, DEMO_DAY_START_MIN, planDemoDay } from '../../src/seedPlan.js';

const TZ = 'Europe/Zurich';

/** Replays the plan and returns the plates still parked at the end (fails on inconsistent sequences). */
function simulate(plan: ReturnType<typeof planDemoDay>): Set<string> {
  const parked = new Set<string>();
  for (const a of plan.actions) {
    const plate = normalizePlate(a.plateDisplay);
    if (a.direction === 'in') {
      expect(parked.has(plate), `${plate} enters twice`).toBe(false);
      parked.add(plate);
    } else {
      expect(parked.has(plate), `${plate} leaves without entering`).toBe(true);
      parked.delete(plate);
    }
  }
  return parked;
}

describe('planDemoDay', () => {
  it.each([20, 40, 60, 100, 250])('leaves 45–60 %% of capacity %i parked (incl. 2 v1 cars)', (capacity) => {
    const plan = planDemoDay(capacity, 2);
    const parked = simulate(plan);
    expect(parked.size).toBe(plan.parkedAtEnd);
    const occupancy = (parked.size + 2) / capacity;
    expect(occupancy).toBeGreaterThanOrEqual(0.45);
    expect(occupancy).toBeLessThanOrEqual(0.6);
  });

  it('matches the spec for the default lot (40)', () => {
    const plan = planDemoDay(40);
    expect(plan.staff.length).toBeGreaterThanOrEqual(20);
    expect(plan.visitors.filter((v) => !v.existingPermit)).toHaveLength(2);
    const plates = [...plan.staff, ...plan.visitors].map((p) => normalizePlate(p.plateDisplay));
    expect(new Set(plates).size).toBe(plates.length);
    expect(new Set(plan.actions.map((a) => a.gateId))).toEqual(new Set(['north', 'south']));
    for (const a of plan.actions) {
      expect(a.minute).toBeGreaterThanOrEqual(DEMO_DAY_START_MIN);
      expect(a.minute).toBeLessThanOrEqual(DEMO_DAY_END_MIN);
    }
    const morning = plan.actions.filter((a) => a.direction === 'in' && a.minute < 10 * 60).length;
    expect(morning).toBeGreaterThan(plan.actions.filter((a) => a.direction === 'in').length / 2);
    expect(plan.actions.some((a) => a.plateDisplay === plan.denied.plateDisplay && a.direction === 'in')).toBe(true);
  });

  it('is deterministic', () => {
    expect(planDemoDay(40)).toEqual(planDemoDay(40));
  });
});

describe('demoClock', () => {
  const day = '2026-09-30';

  it('uses natural times after 18:30', () => {
    const clock = demoClock(day, TZ, zonedTimeToUtc(day, '20:00', TZ));
    expect(clock(DEMO_DAY_START_MIN).toISOString()).toBe(zonedTimeToUtc(day, '06:00', TZ).toISOString());
    expect(clock(8 * 60 + 15).toISOString()).toBe(zonedTimeToUtc(day, '08:15', TZ).toISOString());
    expect(clock(DEMO_DAY_END_MIN).toISOString()).toBe(zonedTimeToUtc(day, '18:30', TZ).toISOString());
  });

  it.each(['00:00', '00:03', '07:10', '11:00', '18:29'])('compresses into the elapsed day when seeded at %s', (time) => {
    const now = new Date(zonedTimeToUtc(day, time, TZ).getTime() + 30_000);
    const clock = demoClock(day, TZ, now);
    const first = clock(DEMO_DAY_START_MIN);
    const last = clock(DEMO_DAY_END_MIN);
    expect(first.getTime()).toBeGreaterThanOrEqual(zonedTimeToUtc(day, '00:00', TZ).getTime());
    expect(last.getTime()).toBeLessThan(now.getTime());
    expect(last.getTime()).toBeGreaterThanOrEqual(first.getTime());
    expect(dateInTz(first, TZ)).toBe(day);
  });
});
