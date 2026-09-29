import { describe, expect, it } from 'vitest';
import type { Alarm } from '../../src/services/alarms.js';
import {
  alarmsUrl,
  buildGenericPayload,
  buildSlackPayload,
  buildSummary,
  buildTeamsPayload,
  buildWebhookPayload,
} from '../../src/services/webhookPayload.js';

const ctx = { publicAppUrl: 'https://parklens.example.com/', timezone: 'Europe/Zurich' };

const alarm: Alarm = {
  id: '6f1c8c1e-9a3b-4f7e-8d7a-111111111111',
  type: 'unauthorized_entry',
  plate: 'ZH999999',
  status: 'open',
  occurredAt: '2026-09-29T12:05:00.000Z',
  gateId: 'main',
  sessionId: '6f1c8c1e-9a3b-4f7e-8d7a-222222222222',
  isStillParked: true,
  previousAlarmCount: 2,
  resolvedAt: null,
  resolvedByName: null,
  resolutionNote: null,
  webhookStatus: 'pending',
  webhookError: null,
  createdAt: '2026-09-29T12:05:00.100Z',
};

describe('webhook payloads', () => {
  it('builds the alarm URL without double slashes', () => {
    expect(alarmsUrl(ctx)).toBe('https://parklens.example.com/admin/alarms');
  });

  it('summary mentions plate, local time and gate', () => {
    const s = buildSummary('alarm.created', alarm, ctx);
    expect(s).toContain('ZH999999');
    expect(s).toContain('2026-09-29 14:05');
    expect(s).toContain('gate main');
    expect(buildSummary('alarm.created', { ...alarm, type: 'overstay', gateId: null }, ctx)).toContain('still parked');
  });

  it('generic: {event, text, alarm, url}', () => {
    const p = buildGenericPayload('alarm.created', alarm, ctx);
    expect(Object.keys(p).sort()).toEqual(['alarm', 'event', 'text', 'url']);
    expect(p.event).toBe('alarm.created');
    expect(p.alarm).toEqual(alarm);
    expect(p.url).toBe('https://parklens.example.com/admin/alarms');
  });

  it('slack: text + blocks with plate, type, time, gate and link', () => {
    const p = buildSlackPayload('alarm.created', alarm, ctx);
    expect(typeof p.text).toBe('string');
    const json = JSON.stringify(p.blocks);
    for (const s of ['ZH999999', 'Unauthorized entry', '2026-09-29 14:05', 'main', 'https://parklens.example.com/admin/alarms']) {
      expect(json).toContain(s);
    }
    expect(p.blocks.some((b) => b.type === 'section')).toBe(true);
  });

  it('teams: Workflows-compatible Adaptive Card 1.4 with FactSet + OpenUrl', () => {
    const p = buildTeamsPayload('alarm.created', alarm, ctx);
    expect(p.type).toBe('message');
    const att = p.attachments[0]!;
    expect(att.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(att.content.type).toBe('AdaptiveCard');
    expect(att.content.version).toBe('1.4');
    const factSet = att.content.body.find((b) => b.type === 'FactSet') as { facts: { title: string; value: string }[] };
    expect(factSet.facts).toContainEqual({ title: 'Plate', value: 'ZH999999' });
    expect(att.content.actions[0]).toMatchObject({ type: 'Action.OpenUrl', url: 'https://parklens.example.com/admin/alarms' });
  });

  it('dispatches by format', () => {
    expect(buildWebhookPayload('generic', 'alarm.created', alarm, ctx)).toHaveProperty('alarm');
    expect(buildWebhookPayload('slack', 'alarm.created', alarm, ctx)).toHaveProperty('blocks');
    expect(buildWebhookPayload('teams', 'alarm.created', alarm, ctx)).toHaveProperty('attachments');
    expect(buildWebhookPayload('generic', 'webhook.test', alarm, ctx)).toMatchObject({ event: 'webhook.test' });
  });
});
