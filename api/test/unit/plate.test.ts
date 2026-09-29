import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import { displayPlate, normalizePlate, parsePlate } from '../../src/lib/plate.js';

describe('normalizePlate', () => {
  it.each([
    ['zh 123-456', 'ZH123456'],
    ['ZH 123 456', 'ZH123456'],
    ['  be.98/765 ', 'BE98765'],
    ['mü 12', 'MÜ12'],
    ['KÖ-ä 1', 'KÖÄ1'],
    ['mü 1', 'MÜ1'], // decomposed umlaut (u + combining diaeresis)
    ['ZH·123_456', 'ZH123456'],
    ['é-1', '1'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizePlate(input)).toBe(expected);
  });
});

describe('parsePlate', () => {
  it('returns normalized plate and display form', () => {
    expect(parsePlate('  zh   123  456 ')).toEqual({ plate: 'ZH123456', plateDisplay: 'zh 123 456' });
  });

  it('accepts 2 and 12 characters', () => {
    expect(parsePlate('A1').plate).toBe('A1');
    expect(parsePlate('ABCDEF-123456').plate).toBe('ABCDEF123456');
  });

  it.each(['A', '-', '  ', 'ABCDEFG1234567', 'éé'])('rejects %j with 422 INVALID_PLATE', (input) => {
    try {
      parsePlate(input);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(422);
      expect((err as AppError).code).toBe('INVALID_PLATE');
    }
  });

  it('displayPlate collapses whitespace', () => {
    expect(displayPlate(' SG\t1  234 ')).toBe('SG 1 234');
  });
});
