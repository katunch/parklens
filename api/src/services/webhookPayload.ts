import type { WebhookFormat } from '../config.js';
import { formatInTz } from '../lib/time.js';
import type { Alarm } from './alarms.js';

/** Pure payload builders for the outgoing alarm webhook (generic / Slack / Teams). */

export type WebhookEvent = 'alarm.created' | 'webhook.test';

export interface WebhookContext {
  publicAppUrl: string;
  timezone: string;
}

const TYPE_LABEL: Record<Alarm['type'], string> = {
  unauthorized_entry: 'Unauthorized entry',
  overstay: 'Overstay',
};

export function alarmsUrl(ctx: WebhookContext): string {
  return `${ctx.publicAppUrl.replace(/\/+$/, '')}/admin/alarms`;
}

interface Facts {
  title: string;
  plate: string;
  type: string;
  time: string;
  gate: string;
  url: string;
}

function facts(event: WebhookEvent, alarm: Alarm, ctx: WebhookContext): Facts {
  const title = event === 'webhook.test' ? 'ParkLens test notification' : `ParkLens alarm: ${TYPE_LABEL[alarm.type]}`;
  return {
    title,
    plate: alarm.plate,
    type: TYPE_LABEL[alarm.type],
    time: `${formatInTz(new Date(alarm.occurredAt), ctx.timezone)} (${ctx.timezone})`,
    gate: alarm.gateId ?? '–',
    url: alarmsUrl(ctx),
  };
}

export function buildSummary(event: WebhookEvent, alarm: Alarm, ctx: WebhookContext): string {
  const f = facts(event, alarm, ctx);
  if (event === 'webhook.test') {
    return `ParkLens test notification: webhook delivery works (sample plate ${f.plate}).`;
  }
  const what =
    alarm.type === 'overstay'
      ? `${f.plate} is still parked after its daily permit expired`
      : `${f.plate} entered without a valid permit`;
  const local = formatInTz(new Date(alarm.occurredAt), ctx.timezone);
  return `ParkLens alarm – ${f.type}: ${what} at ${local} (${ctx.timezone}${alarm.gateId ? `, gate ${alarm.gateId}` : ''}).`;
}

export function buildGenericPayload(event: WebhookEvent, alarm: Alarm, ctx: WebhookContext) {
  return { event, text: buildSummary(event, alarm, ctx), alarm, url: alarmsUrl(ctx) };
}

export function buildSlackPayload(event: WebhookEvent, alarm: Alarm, ctx: WebhookContext) {
  const f = facts(event, alarm, ctx);
  const summary = buildSummary(event, alarm, ctx);
  return {
    text: summary,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: f.title, emoji: false } },
      { type: 'section', text: { type: 'mrkdwn', text: summary } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Plate:*\n${f.plate}` },
          { type: 'mrkdwn', text: `*Type:*\n${f.type}` },
          { type: 'mrkdwn', text: `*Time:*\n${f.time}` },
          { type: 'mrkdwn', text: `*Gate:*\n${f.gate}` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `<${f.url}|Open alarms in ParkLens>` } },
    ],
  };
}

export function buildTeamsPayload(event: WebhookEvent, alarm: Alarm, ctx: WebhookContext) {
  const f = facts(event, alarm, ctx);
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: f.title,
              weight: 'Bolder',
              size: 'Medium',
              color: event === 'webhook.test' ? 'Default' : 'Attention',
              wrap: true,
            },
            { type: 'TextBlock', text: buildSummary(event, alarm, ctx), wrap: true },
            {
              type: 'FactSet',
              facts: [
                { title: 'Plate', value: f.plate },
                { title: 'Type', value: f.type },
                { title: 'Time', value: f.time },
                { title: 'Gate', value: f.gate },
              ],
            },
          ],
          actions: [{ type: 'Action.OpenUrl', title: 'Open in ParkLens', url: f.url }],
        },
      },
    ],
  };
}

export function buildWebhookPayload(
  format: WebhookFormat,
  event: WebhookEvent,
  alarm: Alarm,
  ctx: WebhookContext,
): unknown {
  switch (format) {
    case 'slack':
      return buildSlackPayload(event, alarm, ctx);
    case 'teams':
      return buildTeamsPayload(event, alarm, ctx);
    case 'generic':
    default:
      return buildGenericPayload(event, alarm, ctx);
  }
}

/** A sample alarm used by "send test". */
export function sampleAlarm(now: Date = new Date()): Alarm {
  const iso = now.toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000000',
    type: 'unauthorized_entry',
    plate: 'TEST123',
    status: 'open',
    occurredAt: iso,
    gateId: 'test',
    sessionId: null,
    isStillParked: false,
    previousAlarmCount: 0,
    resolvedAt: null,
    resolvedByName: null,
    resolutionNote: null,
    webhookStatus: 'pending',
    webhookError: null,
    createdAt: iso,
  };
}
