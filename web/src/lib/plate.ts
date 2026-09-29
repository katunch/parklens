/**
 * Licence plate helpers. Mirrors the backend (api/src/lib/plate.ts):
 * NFC, uppercase, keep only A-Z 0-9 Ä Ö Ü; valid when 2–12 characters remain.
 */

export const PLATE_MIN_LENGTH = 2;
export const PLATE_MAX_LENGTH = 12;

export function normalizePlate(input: string): string {
  return input.normalize('NFC').toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');
}

export function isValidPlate(input: string): boolean {
  const n = normalizePlate(input);
  return n.length >= PLATE_MIN_LENGTH && n.length <= PLATE_MAX_LENGTH;
}

/** Group digits in threes from the right: "123456" → "123 456", "1234" → "1 234". */
function groupDigits(digits: string): string {
  const out: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    out.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return out.join(' ');
}

/**
 * Display form of a normalized plate (UX §2.1): Swiss canton plates get a space after the
 * canton and digits grouped in threes (`ZH123456` → `ZH 123 456`). Anything else is returned
 * normalized, unchanged.
 */
export function formatPlate(plate: string): string {
  const n = normalizePlate(plate);
  const m = /^([A-ZÄÖÜ]{2})(\d{1,6})$/.exec(n);
  if (!m) return n;
  return `${m[1]} ${groupDigits(m[2] ?? '')}`;
}

/** The string to show for an object: `plateDisplay` when present, else the formatted plate. */
export function displayPlate(obj: { plate: string; plateDisplay?: string | null }): string {
  return obj.plateDisplay && obj.plateDisplay.trim() !== '' ? obj.plateDisplay : formatPlate(obj.plate);
}

const CANTONS = ['ZH', 'BE', 'LU', 'SG', 'AG', 'TG', 'VD', 'GE', 'TI', 'BS'] as const;

/** Random Swiss-style plate for the simulator: canton + 1–6 digits. */
export function randomPlate(rand: () => number = Math.random): string {
  const canton = CANTONS[Math.floor(rand() * CANTONS.length)] ?? 'ZH';
  const len = 1 + Math.floor(rand() * 6);
  let digits = String(1 + Math.floor(rand() * 9));
  while (digits.length < len) digits += String(Math.floor(rand() * 10));
  return formatPlate(canton + digits);
}
