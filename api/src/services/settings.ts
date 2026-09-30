import { config, LOT_CAPACITY_MAX, LOT_CAPACITY_MIN, WEBHOOK_FORMATS, type WebhookFormat } from '../config.js';
import { query, type Queryable } from '../db.js';

export interface WebhookSettings {
  enabled: boolean;
  url: string; // '' when unset
  format: WebhookFormat;
}

export interface LotSettings {
  capacity: number;
}

export interface PublicSettings {
  webhook: WebhookSettings;
  lot: LotSettings;
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

function defaultLotSettings(): LotSettings {
  return { capacity: config.lotCapacity };
}

function coerceLot(value: unknown): LotSettings {
  const c = (value as Partial<LotSettings> | null)?.capacity;
  return typeof c === 'number' && Number.isInteger(c) && c >= LOT_CAPACITY_MIN && c <= LOT_CAPACITY_MAX
    ? { capacity: c }
    : defaultLotSettings();
}

/**
 * Initialize settings on first start only: 'webhook' from WEBHOOK_URL / WEBHOOK_FORMAT, 'lot' from LOT_CAPACITY.
 * Existing rows (saved via the UI) always win.
 */
export async function initSettings(): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('webhook', $1::jsonb), ('lot', $2::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(defaultWebhookSettings()), JSON.stringify(defaultLotSettings())],
  );
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

export async function getLotSettings(db: Queryable = { query }): Promise<LotSettings> {
  const { rows } = await db.query<{ value: unknown }>(`SELECT value FROM settings WHERE key = 'lot'`);
  return rows[0] ? coerceLot(rows[0].value) : defaultLotSettings();
}

export async function setLotSettings(lot: LotSettings): Promise<LotSettings> {
  const value = coerceLot(lot);
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('lot', $1::jsonb, now())
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
  const [webhook, lot] = await Promise.all([getWebhookSettings(), getLotSettings()]);
  return { webhook, lot, timezone: config.timezone, gateApiKeyHint: gateApiKeyHint() };
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
