import { randomBytes, randomInt } from 'node:crypto';

/** Unambiguous alphabet (no 0/O, 1/I/L). */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Public request reference, e.g. "PL-7K3Q9". */
export function generateReference(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `PL-${s}`;
}

/** 32 url-safe random characters (192 bits). */
export function generatePublicToken(): string {
  return randomBytes(24).toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
