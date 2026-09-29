export type WebhookFormat = 'generic' | 'slack' | 'teams';

export const WEBHOOK_FORMATS: readonly WebhookFormat[] = ['generic', 'slack', 'teams'];

export interface Config {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  gateApiKey: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  timezone: string;
  publicAppUrl: string;
  seedDemoData: boolean;
  webhookUrl: string;
  webhookFormat: WebhookFormat;
  logRequests: boolean;
}

function str(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const v = env[key];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const v = env[key];
  if (v === undefined || v.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = str(env, 'NODE_ENV', 'development');

  const timezone = str(env, 'APP_TIMEZONE', 'Europe/Zurich');
  if (!isValidTimezone(timezone)) {
    throw new Error(`APP_TIMEZONE "${timezone}" is not a valid IANA time zone`);
  }

  const port = Number.parseInt(str(env, 'PORT', '3000'), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT "${env['PORT']}" is invalid`);
  }

  const rawFormat = str(env, 'WEBHOOK_FORMAT', 'generic').toLowerCase();
  const webhookFormat = (WEBHOOK_FORMATS as readonly string[]).includes(rawFormat)
    ? (rawFormat as WebhookFormat)
    : 'generic';

  return {
    nodeEnv,
    port,
    databaseUrl: str(env, 'DATABASE_URL', 'postgres://parklens:parklens@localhost:5432/parklens'),
    jwtSecret: str(env, 'JWT_SECRET', 'change-me-in-production'),
    gateApiKey: str(env, 'GATE_API_KEY', 'dev-gate-key'),
    adminEmail: str(env, 'ADMIN_EMAIL', 'admin@parklens.local').toLowerCase(),
    adminPassword: str(env, 'ADMIN_PASSWORD', 'parklens-admin'),
    adminName: str(env, 'ADMIN_NAME', 'Parking Admin'),
    timezone,
    publicAppUrl: str(env, 'PUBLIC_APP_URL', 'http://localhost:8088').replace(/\/+$/, ''),
    seedDemoData: bool(env, 'SEED_DEMO_DATA', true),
    webhookUrl: str(env, 'WEBHOOK_URL', ''),
    webhookFormat,
    logRequests: nodeEnv !== 'test',
  };
}

export const config: Config = loadConfig();
