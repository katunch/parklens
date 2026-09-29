import { isValidPlate, normalizePlate } from './plate';

/** A translatable message: i18n key + interpolation values. */
export interface Msg {
  key: string;
  values?: Record<string, string | number>;
}

export type MaybeMsg = Msg | null;

/** Client-side limits from UX §2.5 (stricter than the API on purpose). */
export const LIMITS = {
  nameMin: 2,
  nameMax: 100,
  emailMax: 254,
  noteMax: 500,
  gateMax: 50,
  passwordMin: 10,
  passwordMax: 200,
  plateInputMax: 20,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePlate(value: string): MaybeMsg {
  if (normalizePlate(value) === '' && value.trim() === '') return { key: 'validation.plateRequired' };
  if (!isValidPlate(value)) return { key: 'validation.plateInvalid' };
  return null;
}

export function validateName(value: string): MaybeMsg {
  const v = value.trim();
  if (!v) return { key: 'validation.nameRequired' };
  if (v.length < LIMITS.nameMin) return { key: 'validation.nameTooShort', values: { min: LIMITS.nameMin } };
  if (v.length > LIMITS.nameMax) return { key: 'validation.tooLong', values: { max: LIMITS.nameMax } };
  return null;
}

export function validateEmail(value: string, required: boolean): MaybeMsg {
  const v = value.trim();
  if (!v) return required ? { key: 'validation.emailRequired' } : null;
  if (v.length > LIMITS.emailMax || !EMAIL_RE.test(v)) return { key: 'validation.emailInvalid' };
  return null;
}

export function validateNote(value: string, max: number = LIMITS.noteMax): MaybeMsg {
  return value.trim().length > max ? { key: 'validation.tooLong', values: { max } } : null;
}

export function validateGate(value: string): MaybeMsg {
  return value.trim().length > LIMITS.gateMax ? { key: 'validation.gateTooLong', values: { max: LIMITS.gateMax } } : null;
}

/** Daily-permit date: required, ≥ today, ≤ maxDate (all `YYYY-MM-DD`, compared as strings). */
export function validateDate(value: string, today: string, maxDate: string, formatMax: (ymd: string) => string): MaybeMsg {
  if (!value) return { key: 'validation.dateRequired' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { key: 'validation.dateRequired' };
  if (value < today) return { key: 'validation.dateInPast' };
  if (value > maxDate) return { key: 'validation.dateTooFar', values: { date: formatMax(maxDate) } };
  return null;
}

export function validateRequiredPassword(value: string): MaybeMsg {
  return value ? null : { key: 'validation.passwordRequired' };
}

export function validateNewPassword(value: string): MaybeMsg {
  if (!value) return { key: 'validation.passwordRequired' };
  if (value.length < LIMITS.passwordMin) return { key: 'validation.passwordTooShort', values: { min: LIMITS.passwordMin } };
  if (value.length > LIMITS.passwordMax) return { key: 'validation.tooLong', values: { max: LIMITS.passwordMax } };
  return null;
}

export function validateWebhookUrl(value: string, enabled: boolean): MaybeMsg {
  const v = value.trim();
  if (!v) return enabled ? { key: 'validation.urlRequired' } : null;
  if (!/^https?:\/\//i.test(v)) return { key: 'validation.urlInvalid' };
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { key: 'validation.urlInvalid' };
  } catch {
    return { key: 'validation.urlInvalid' };
  }
  return null;
}

/** Trim, and turn empty strings into `undefined` so optional fields are omitted. */
export function optional(value: string): string | undefined {
  const v = value.trim();
  return v === '' ? undefined : v;
}
