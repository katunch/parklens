import { errors } from './errors.js';

export const PLATE_MIN_LENGTH = 2;
export const PLATE_MAX_LENGTH = 12;

/**
 * Normalize a licence plate: Unicode NFC (so decomposed umlauts become Ä/Ö/Ü), uppercase,
 * then keep only A-Z, 0-9, Ä, Ö, Ü.  "zh 123-456" → "ZH123456", "mü 1" → "MÜ1".
 */
export function normalizePlate(input: string): string {
  return input.normalize('NFC').toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');
}

export function isValidNormalizedPlate(plate: string): boolean {
  return plate.length >= PLATE_MIN_LENGTH && plate.length <= PLATE_MAX_LENGTH;
}

/** Display form: the original input, trimmed and with whitespace collapsed. */
export function displayPlate(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export interface ParsedPlate {
  plate: string;
  plateDisplay: string;
}

/** Normalize + validate; throws 422 INVALID_PLATE when the normalized plate is not 2–12 chars. */
export function parsePlate(input: string): ParsedPlate {
  const plate = normalizePlate(input);
  if (!isValidNormalizedPlate(plate)) throw errors.invalidPlate();
  return { plate, plateDisplay: displayPlate(input) };
}
