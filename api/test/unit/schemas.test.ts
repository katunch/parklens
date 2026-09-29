import { describe, expect, it } from 'vitest';
import {
  createPermitSchema,
  gateSchema,
  listAlarmsQuery,
  listPermitsQuery,
  paginationQuery,
  publicRequestSchema,
  resolveAlarmSchema,
  updateSettingsSchema,
} from '../../src/schemas.js';

describe('createPermitSchema', () => {
  it('accepts a permanent permit and drops validDate / normalizes optional fields', () => {
    const v = createPermitSchema.parse({
      plate: ' ZH 1 ',
      holderName: ' Anna ',
      holderEmail: '',
      type: 'permanent',
      validDate: '2030-01-01',
    });
    expect(v).toEqual({ plate: 'ZH 1', holderName: 'Anna', holderEmail: null, type: 'permanent', validDate: null, requestNote: null });
  });

  it('requires validDate for daily permits', () => {
    const r = createPermitSchema.safeParse({ plate: 'ZH1', holderName: 'A', type: 'daily' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['validDate']);
  });

  it('rejects malformed dates, emails and types', () => {
    expect(createPermitSchema.safeParse({ plate: 'ZH1', holderName: 'A', type: 'daily', validDate: '2026-02-30' }).success).toBe(false);
    expect(createPermitSchema.safeParse({ plate: 'ZH1', holderName: 'A', type: 'permanent', holderEmail: 'nope' }).success).toBe(false);
    expect(createPermitSchema.safeParse({ plate: 'ZH1', holderName: 'A', type: 'weekly' }).success).toBe(false);
    expect(createPermitSchema.safeParse({ plate: '', holderName: 'A', type: 'permanent' }).success).toBe(false);
    expect(createPermitSchema.safeParse({ plate: 'ZH1', holderName: '  ', type: 'permanent' }).success).toBe(false);
  });
});

describe('publicRequestSchema', () => {
  it('requires holderEmail', () => {
    expect(publicRequestSchema.safeParse({ plate: 'ZH1', holderName: 'A', type: 'permanent' }).success).toBe(false);
    const ok = publicRequestSchema.parse({
      plate: 'ZH1',
      holderName: 'A',
      holderEmail: ' a@example.com ',
      type: 'daily',
      validDate: '2030-05-01',
      requestNote: 'hi',
    });
    expect(ok.holderEmail).toBe('a@example.com');
    expect(ok.validDate).toBe('2030-05-01');
  });
});

describe('gateSchema', () => {
  it('defaults occurredAt to now and gateId to null', () => {
    const before = Date.now();
    const v = gateSchema.parse({ plate: 'ZH 1' });
    expect(v.occurredAt).toBeInstanceOf(Date);
    expect(v.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(v.gateId).toBeNull();
  });

  it('parses ISO timestamps with offset and rejects garbage', () => {
    expect(gateSchema.parse({ plate: 'A1', occurredAt: '2026-09-29T08:00:00+02:00' }).occurredAt.toISOString()).toBe(
      '2026-09-29T06:00:00.000Z',
    );
    expect(gateSchema.safeParse({ plate: 'A1', occurredAt: 'yesterday' }).success).toBe(false);
    expect(gateSchema.safeParse({}).success).toBe(false);
  });
});

describe('query schemas', () => {
  it('applies pagination defaults and clamps limit to 200', () => {
    expect(paginationQuery.parse({})).toEqual({ limit: 50, offset: 0 });
    expect(paginationQuery.parse({ limit: '500', offset: '10' })).toEqual({ limit: 200, offset: 10 });
    expect(paginationQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(paginationQuery.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('parses filters', () => {
    expect(listPermitsQuery.parse({ activeToday: 'true', status: 'pending', q: ' zh ' })).toMatchObject({
      activeToday: true,
      status: 'pending',
      q: 'zh',
    });
    expect(listPermitsQuery.safeParse({ status: 'bogus' }).success).toBe(false);
    expect(listAlarmsQuery.parse({}).status).toBe('all');
  });
});

describe('resolveAlarmSchema', () => {
  it('accepts empty body and grantDailyPermit', () => {
    expect(resolveAlarmSchema.parse({})).toEqual({ note: null, grantDailyPermit: null });
    expect(resolveAlarmSchema.parse({ note: 'ok', grantDailyPermit: { holderName: 'Guest' } })).toEqual({
      note: 'ok',
      grantDailyPermit: { holderName: 'Guest', holderEmail: null },
    });
    expect(resolveAlarmSchema.safeParse({ grantDailyPermit: {} }).success).toBe(false);
  });
});

describe('updateSettingsSchema', () => {
  it('requires an http(s) URL when enabled', () => {
    expect(updateSettingsSchema.safeParse({ webhook: { enabled: true, url: '', format: 'slack' } }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ webhook: { enabled: true, url: 'ftp://x', format: 'slack' } }).success).toBe(false);
    expect(updateSettingsSchema.parse({ webhook: { enabled: true, url: 'https://hooks.example.com/x', format: 'teams' } })).toEqual({
      webhook: { enabled: true, url: 'https://hooks.example.com/x', format: 'teams' },
    });
  });

  it('allows an empty URL when disabled', () => {
    expect(updateSettingsSchema.parse({ webhook: { enabled: false, url: null, format: 'generic' } }).webhook).toEqual({
      enabled: false,
      url: '',
      format: 'generic',
    });
    expect(updateSettingsSchema.safeParse({ webhook: { enabled: false, url: '', format: 'email' } }).success).toBe(false);
  });
});
