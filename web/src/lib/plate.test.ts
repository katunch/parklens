import { describe, expect, it } from 'vitest';
import { displayPlate, formatPlate, isValidPlate, normalizePlate, randomPlate } from './plate';

describe('normalizePlate', () => {
  it('mirrors the backend: uppercase, keep A-Z 0-9 Ä Ö Ü', () => {
    expect(normalizePlate('zh 123-456')).toBe('ZH123456');
    expect(normalizePlate(' be.98 765 ')).toBe('BE98765');
    expect(normalizePlate('mü 1')).toBe('MÜ1');
    // decomposed umlaut (u + combining diaeresis) is composed first
    expect(normalizePlate('mü 1')).toBe('MÜ1');
  });
});

describe('isValidPlate', () => {
  it('accepts 2–12 characters after normalization', () => {
    expect(isValidPlate('ZH 1')).toBe(true);
    expect(isValidPlate('A')).toBe(false);
    expect(isValidPlate('--')).toBe(false);
    expect(isValidPlate('ABCDEFGHIJKL')).toBe(true);
    expect(isValidPlate('ABCDEFGHIJKLM')).toBe(false);
  });
});

describe('formatPlate', () => {
  it('formats Swiss canton plates with digits grouped in threes from the right', () => {
    expect(formatPlate('ZH123456')).toBe('ZH 123 456');
    expect(formatPlate('BE98765')).toBe('BE 98 765');
    expect(formatPlate('SG1234')).toBe('SG 1 234');
    expect(formatPlate('LU777')).toBe('LU 777');
    expect(formatPlate('ZH1')).toBe('ZH 1');
  });

  it('returns anything else normalized and unchanged', () => {
    expect(formatPlate('ABC123')).toBe('ABC123');
    expect(formatPlate('ZH1234567')).toBe('ZH1234567');
    expect(formatPlate('D-AB 1234')).toBe('DAB1234');
  });

  it('prefers plateDisplay when present', () => {
    expect(displayPlate({ plate: 'ZH123456', plateDisplay: 'zh 123456' })).toBe('zh 123456');
    expect(displayPlate({ plate: 'ZH123456', plateDisplay: '' })).toBe('ZH 123 456');
    expect(displayPlate({ plate: 'ZH123456' })).toBe('ZH 123 456');
  });
});

describe('randomPlate', () => {
  it('produces a valid, formatted canton plate', () => {
    for (let i = 0; i < 50; i++) {
      const p = randomPlate();
      expect(isValidPlate(p)).toBe(true);
      expect(p).toMatch(/^[A-Z]{2} \d{1,3}( \d{3})?$/);
    }
  });
});
