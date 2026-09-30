import { describe, expect, it } from 'vitest';
import { checkoutProbability, nextDelay, pickGate, planStep, randomUnknownPlate, type PlanInput } from './autopilot';
import { normalizePlate } from './plate';

/** Deterministic rand from a list of values (cycled). */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

const NOW = Date.parse('2026-09-30T10:00:00Z');
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  permitted: [{ plate: 'ZH123456', plateDisplay: 'ZH 123 456' }, { plate: 'BE98765', plateDisplay: 'BE 98 765' }],
  parked: [],
  capacity: 40,
  now: NOW,
  lastUnknownAt: null,
  gates: [
    { gateId: 'north', eventsToday: 20 },
    { gateId: 'south', eventsToday: 10 },
  ],
  ...over,
});

describe('pacing and probabilities', () => {
  it('keeps delays in the pace ranges', () => {
    expect(nextDelay('calm', () => 0)).toBe(8000);
    expect(nextDelay('calm', () => 0.999)).toBeLessThanOrEqual(15000);
    expect(nextDelay('busy', () => 0)).toBe(3000);
    expect(nextDelay('busy', () => 0.999)).toBeLessThanOrEqual(6000);
  });

  it('clamps the check-out probability', () => {
    expect(checkoutProbability(0.5)).toBeCloseTo(0.15);
    expect(checkoutProbability(0)).toBe(0.05);
    expect(checkoutProbability(1)).toBeCloseTo(0.75);
    expect(checkoutProbability(2)).toBe(0.8);
  });

  it('weights gates north 60 / south 40', () => {
    expect(pickGate(base().gates, () => 0.59)).toBe('north');
    expect(pickGate(base().gates, () => 0.61)).toBe('south');
    expect(pickGate([{ gateId: 'east', eventsToday: 5 }, { gateId: 'north', eventsToday: 5 }], () => 0.1)).toBe('east');
  });
});

describe('planStep', () => {
  it('forces a check-in when the lot is empty, picking a permitted plate that is not parked', () => {
    const p = planStep(base(), seq(0.9, 0.5, 0.9, 0.0));
    expect(p).toMatchObject({ kind: 'in', unknown: false });
    expect(['ZH 123 456', 'BE 98 765']).toContain(p!.plate);
  });

  it('never checks in a plate that is already parked', () => {
    const parked = [{ plate: 'ZH123456', authorized: true, enteredAt: '2026-09-30T07:00:00Z' }];
    for (let i = 0; i < 20; i++) {
      const p = planStep(base({ parked, capacity: 1000 }), seq(0.99, 0.3, 0.99, i / 20));
      if (p?.kind === 'in' && !p.unknown) expect(normalizePlate(p.plate)).not.toBe('ZH123456');
    }
  });

  it('forces a check-out at ≥ 95 % occupancy', () => {
    const parked = Array.from({ length: 19 }, (_, i) => ({ plate: `ZH${100 + i}`, authorized: true, enteredAt: '2026-09-30T07:00:00Z' }));
    expect(planStep(base({ parked, capacity: 20 }), seq(0.5))!.kind).toBe('out');
  });

  it('sends an unknown plate only after the 60 s gap', () => {
    const parked = [{ plate: 'LU777', authorized: true, enteredAt: '2026-09-30T07:00:00Z' }];
    // rand: gate, wantOut? (0.99 → no), unknown? (0.01 → yes), plate digits…
    const unknown = planStep(base({ parked, lastUnknownAt: null }), seq(0.3, 0.99, 0.01, 0.2, 0.5, 0.5));
    expect(unknown).toMatchObject({ kind: 'in', unknown: true });
    const blocked = planStep(base({ parked, lastUnknownAt: NOW - 10_000 }), seq(0.3, 0.99, 0.01, 0.2, 0.5, 0.5));
    expect(blocked!.unknown).toBe(false);
  });

  it('lets unknown cars leave only after 5 minutes', () => {
    const parked = [{ plate: 'OW1287', authorized: false, enteredAt: new Date(NOW - 60_000).toISOString() }];
    // forced out (ratio 1) but the only car is an unknown one parked for 1 min → nothing to do
    expect(planStep(base({ parked, capacity: 1 }), seq(0.5))).toBeNull();
    const later = [{ plate: 'OW1287', authorized: false, enteredAt: new Date(NOW - 6 * 60_000).toISOString() }];
    expect(planStep(base({ parked: later, capacity: 1 }), seq(0.5))).toMatchObject({ kind: 'out', plate: 'OW 1 287' });
  });

  it('creates unknown plates that are neither permitted nor parked', () => {
    const taken = new Set(['ZH1', 'ZH12']);
    const p = randomUnknownPlate(taken, seq(0, 0, 0.1));
    expect(taken.has(normalizePlate(p))).toBe(false);
  });
});
