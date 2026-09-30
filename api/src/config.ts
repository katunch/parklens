export type WebhookFormat = 'generic' | 'slack' | 'teams';

export const WEBHOOK_FORMATS: readonly WebhookFormat[] = ['generic', 'slack', 'teams'];

export const LOT_CAPACITY_MIN = 1;
export const LOT_CAPACITY_MAX = 5000;

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
  lotCapacity: number;
  trustProxyHops: number;
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

  const lotCapacity = Number(str(env, 'LOT_CAPACITY', '40'));
  if (!Number.isInteger(lotCapacity) || lotCapacity < LOT_CAPACITY_MIN || lotCapacity > LOT_CAPACITY_MAX) {
    throw new Error(`LOT_CAPACITY "${env['LOT_CAPACITY']}" must be an integer between ${LOT_CAPACITY_MIN} and ${LOT_CAPACITY_MAX}`);
  }

  const trustProxyHops = Number(str(env, 'TRUST_PROXY_HOPS', '1'));
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error(`TRUST_PROXY_HOPS "${env['TRUST_PROXY_HOPS']}" must be an integer between 0 and 10`);
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
    lotCapacity,
    trustProxyHops,
    logRequests: nodeEnv !== 'test',
  };
}

export const config: Config = loadConfig();
