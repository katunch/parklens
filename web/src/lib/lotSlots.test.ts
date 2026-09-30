import { describe, expect, it } from 'vitest';
import { assignSlots } from './lotSlots';

const s = (id: string, plate: string, t: string) => ({ id, plate, enteredAt: `2026-09-30T${t}:00Z` });

describe('assignSlots', () => {
  it('assigns compactly by arrival on first load', () => {
    const m = assignSlots(null, [s('b', 'BE1', '08:00'), s('a', 'ZH1', '07:00')]);
    expect(m.get('a')!.slot).toBe(0);
    expect(m.get('b')!.slot).toBe(1);
  });

  it('keeps slots, frees closed ones and fills the first free slot', () => {
    let m = assignSlots(null, [s('a', 'ZH1', '07:00'), s('b', 'BE1', '08:00'), s('c', 'LU1', '09:00')]);
    m = assignSlots(m, [s('a', 'ZH1', '07:00'), s('c', 'LU1', '09:00')]);
    expect(m.get('c')!.slot).toBe(2);
    expect(m.has('b')).toBe(false);
    m = assignSlots(m, [s('a', 'ZH1', '07:00'), s('c', 'LU1', '09:00'), s('d', 'SG1', '10:00')]);
    expect(m.get('d')!.slot).toBe(1);
  });

  it('keeps the slot for a superseded session of the same plate', () => {
    let m = assignSlots(null, [s('a', 'ZH1', '07:00'), s('b', 'BE1', '08:00'), s('c', 'LU1', '09:00')]);
    m = assignSlots(m, [s('a', 'ZH1', '07:00'), s('b2', 'BE1', '10:00'), s('c', 'LU1', '09:00')]);
    expect(m.get('b2')!.slot).toBe(1);
  });
});
