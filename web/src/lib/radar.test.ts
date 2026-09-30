import { describe, expect, it } from 'vitest';
import { radarBlips } from './radar';

const NOW = new Date('2026-09-30T08:30:00Z');

describe('radarBlips', () => {
  it('places events of the last hour like a clock face, inner ring for the first gate', () => {
    const b = radarBlips(
      [
        { id: '1', occurredAt: '2026-09-30T08:15:30Z', direction: 'in', authorized: true, gateId: 'north' },
        { id: '2', occurredAt: '2026-09-30T08:20:00Z', direction: 'in', authorized: false, gateId: 'south' },
        { id: '3', occurredAt: '2026-09-30T07:10:00Z', direction: 'out', authorized: null, gateId: 'north' },
      ],
      'north',
      NOW,
      'Europe/Zurich',
    );
    expect(b).toHaveLength(2);
    expect(b[0]!.angle).toBeCloseTo(15 * 6 + 3);
    expect(b[0]!.radius).toBeLessThan(0.6);
    expect(b[1]!.kind).toBe('denied');
    expect(b[1]!.radius).toBeGreaterThan(0.6);
  });

  it('fades older blips but keeps them visible', () => {
    const [b] = radarBlips([{ id: '1', occurredAt: '2026-09-30T07:31:00Z', direction: 'out', authorized: null, gateId: null }], null, NOW, 'Europe/Zurich');
    expect(b!.opacity).toBeGreaterThanOrEqual(0.35);
    expect(b!.opacity).toBeLessThan(0.6);
    expect(b!.kind).toBe('out');
  });
});
