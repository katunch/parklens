import { config, WEBHOOK_FORMATS, type WebhookFormat } from '../config.js';
import { query, type Queryable } from '../db.js';

export interface WebhookSettings {
  enabled: boolean;
  url: string; // '' when unset
  format: WebhookFormat;
}

export interface PublicSettings {
  webhook: WebhookSettings;
  timezone: string;
  gateApiKeyHint: string;
}

function defaultWebhookSettings(): WebhookSettings {
  return { enabled: config.webhookUrl !== '', url: config.webhookUrl, format: config.webhookFormat };
}

function coerceWebhook(value: unknown): WebhookSettings {
  const v = (value ?? {}) as Partial<WebhookSettings>;
  const format = (WEBHOOK_FORMATS as readonly unknown[]).includes(v.format) ? (v.format as WebhookFormat) : 'generic';
  return { enabled: v.enabled === true, url: typeof v.url === 'string' ? v.url : '', format };
}

/** Initialize the 'webhook' setting from WEBHOOK_URL / WEBHOOK_FORMAT on first start only. */
export async function initSettings(): Promise<void> {
  await query(`INSERT INTO settings (key, value) VALUES ('webhook', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [
    JSON.stringify(defaultWebhookSettings()),
  ]);
}

export async function getWebhookSettings(db: Queryable = { query }): Promise<WebhookSettings> {
  const { rows } = await db.query<{ value: unknown }>(`SELECT value FROM settings WHERE key = 'webhook'`);
  return rows[0] ? coerceWebhook(rows[0].value) : defaultWebhookSettings();
}

export async function setWebhookSettings(ws: WebhookSettings): Promise<WebhookSettings> {
  const value = coerceWebhook(ws);
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('webhook', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  return value;
}

export function isWebhookActive(ws: WebhookSettings): boolean {
  return ws.enabled && ws.url !== '';
}

export function gateApiKeyHint(): string {
  return `${config.gateApiKey.slice(0, 4)}…`;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  return { webhook: await getWebhookSettings(), timezone: config.timezone, gateApiKeyHint: gateApiKeyHint() };
}

export async function getFlag(key: string, db: Queryable = { query }): Promise<boolean> {
  const { rows } = await db.query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value === true;
}

export async function setFlag(key: string, db: Queryable = { query }): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, 'true'::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now()`,
    [key],
  );
}
