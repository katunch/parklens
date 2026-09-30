import { describe, expect, it } from 'vitest';
import { computeOccupancy, gaugeSegments, lotLayout, meterWidths } from './occupancy';

const cars = (auth: number, unauth: number) => [
  ...Array.from({ length: auth }, () => ({ authorized: true })),
  ...Array.from({ length: unauth }, () => ({ authorized: false })),
];

describe('computeOccupancy', () => {
  it('derives every number from the active sessions + capacity', () => {
    const o = computeOccupancy(21, cars(20, 1), 40);
    expect(o).toEqual({ parked: 21, unauthorized: 1, authorized: 20, capacity: 40, free: 19, over: 0, percent: 53 });
  });

  it('handles an over-full lot', () => {
    const o = computeOccupancy(42, cars(40, 2), 40);
    expect(o.free).toBe(0);
    expect(o.over).toBe(2);
    expect(o.percent).toBe(105);
  });

  it('falls back to the summary unauthorized count only when the list is truncated', () => {
    expect(computeOccupancy(250, cars(199, 1), 300, 3).unauthorized).toBe(3);
    expect(computeOccupancy(2, cars(1, 1), 40, 5).unauthorized).toBe(1);
  });
});

describe('gaugeSegments / meterWidths', () => {
  it('splits the 300° arc by capacity', () => {
    const s = gaugeSegments(computeOccupancy(21, cars(20, 1), 40));
    expect(s.authorizedDeg).toBeCloseTo(150);
    expect(s.unauthorizedDeg).toBeCloseTo(7.5);
  });

  it('fills the arc when over capacity', () => {
    const s = gaugeSegments(computeOccupancy(50, cars(45, 5), 40));
    expect(s.authorizedDeg + s.unauthorizedDeg).toBeCloseTo(300);
  });

  it('meter widths agree with the gauge', () => {
    const o = computeOccupancy(10, cars(8, 2), 40);
    expect(meterWidths(o)).toEqual({ authorized: 20, unauthorized: 5 });
  });
});

describe('lotLayout', () => {
  it('switches layouts above 60 and 200', () => {
    expect(lotLayout(40)).toBe('bays');
    expect(lotLayout(60)).toBe('bays');
    expect(lotLayout(61)).toBe('grid');
    expect(lotLayout(200)).toBe('grid');
    expect(lotLayout(201)).toBe('waffle');
  });
});
