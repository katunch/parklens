import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import { validateDate, validateEmail, validateName, validateNote, validatePlate, validateWebhookUrl } from './validation';

describe('validators (UX §2.5)', () => {
  it('plate', () => {
    expect(validatePlate('')?.key).toBe('validation.plateRequired');
    expect(validatePlate('Z')?.key).toBe('validation.plateInvalid');
    expect(validatePlate('zh 123 456')).toBeNull();
  });

  it('name uses the stricter UX limits (2–100)', () => {
    expect(validateName(' ')?.key).toBe('validation.nameRequired');
    expect(validateName('A')?.key).toBe('validation.nameTooShort');
    expect(validateName('x'.repeat(101))?.values).toEqual({ max: 100 });
    expect(validateName('Anna Muster')).toBeNull();
  });

  it('email is required only when asked', () => {
    expect(validateEmail('', true)?.key).toBe('validation.emailRequired');
    expect(validateEmail('', false)).toBeNull();
    expect(validateEmail('nope', false)?.key).toBe('validation.emailInvalid');
    expect(validateEmail('anna@firma.ch', true)).toBeNull();
  });

  it('notes are limited to 500 characters', () => {
    expect(validateNote('x'.repeat(500))).toBeNull();
    expect(validateNote('x'.repeat(501))?.key).toBe('validation.tooLong');
  });

  it('daily-permit date range', () => {
    const fmt = (d: string) => d;
    expect(validateDate('', '2026-09-29', '2026-11-28', fmt)?.key).toBe('validation.dateRequired');
    expect(validateDate('2026-09-28', '2026-09-29', '2026-11-28', fmt)?.key).toBe('validation.dateInPast');
    expect(validateDate('2026-11-29', '2026-09-29', '2026-11-28', fmt)).toEqual({ key: 'validation.dateTooFar', values: { date: '2026-11-28' } });
    expect(validateDate('2026-09-29', '2026-09-29', '2026-11-28', fmt)).toBeNull();
  });

  it('webhook URL is required only when enabled and must be http(s)', () => {
    expect(validateWebhookUrl('', true)?.key).toBe('validation.urlRequired');
    expect(validateWebhookUrl('', false)).toBeNull();
    expect(validateWebhookUrl('ftp://x', false)?.key).toBe('validation.urlInvalid');
    expect(validateWebhookUrl('https://hooks.slack.com/services/T/B/X', true)).toBeNull();
  });
});

describe('copy deck', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));

  it('en and de have identical keys', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('German copy uses Swiss spelling (no ß)', () => {
    expect(JSON.stringify(de)).not.toContain('ß');
  });
});
