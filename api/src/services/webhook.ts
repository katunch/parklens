import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { log } from '../lib/log.js';
import { findAlarm, setWebhookResult, type Alarm } from './alarms.js';
import { publish } from './events.js';
import { getWebhookSettings, isWebhookActive } from './settings.js';
import { buildWebhookPayload, sampleAlarm, type WebhookContext } from './webhookPayload.js';

export const WEBHOOK_TIMEOUT_MS = 5_000;
/** Delay before each attempt: 3 attempts at 0 s, 2 s, 8 s. */
export const WEBHOOK_ATTEMPT_DELAYS_MS = [0, 2_000, 8_000];

export interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

const ctx = (): WebhookContext => ({ publicAppUrl: config.publicAppUrl, timezone: config.timezone });

function describeFetchError(err: unknown): string {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause?.code ?? e?.cause?.message;
  return cause ? `${e.message ?? 'Request failed'} (${cause})` : (e?.message ?? String(err));
}

/** POST JSON with a hard timeout. Never throws. */
export async function postJson(url: string, body: unknown, timeoutMs = WEBHOOK_TIMEOUT_MS): Promise<SendResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'ParkLens-Webhook/1.0' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.ok) return { ok: true, status: res.status, error: null };
    return { ok: false, status: res.status, error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}` };
  } catch (err) {
    const error = ac.signal.aborted ? `Timed out after ${timeoutMs / 1000} s` : describeFetchError(err);
    return { ok: false, status: null, error };
  } finally {
    clearTimeout(timer);
  }
}

/** Network errors, timeouts, 5xx, 408 and 429 are retried; other 4xx are final. */
function isRetryable(r: SendResult): boolean {
  return r.status === null || r.status >= 500 || r.status === 408 || r.status === 429;
}

// ---- in-flight tracking for graceful shutdown -------------------------------

const inflight = new Set<Promise<void>>();
let stopController = new AbortController();

function track(p: Promise<void>): void {
  inflight.add(p);
  void p.finally(() => inflight.delete(p));
}

/** Skip remaining retry back-offs (used on shutdown). */
export function stopWebhookRetries(): void {
  stopController.abort();
}

/** Wait for in-flight notifications (bounded). Resets the stop flag afterwards (tests). */
export async function waitForWebhooks(timeoutMs = 15_000): Promise<void> {
  const all = Promise.allSettled([...inflight]);
  await Promise.race([all, delay(timeoutMs, undefined, { ref: false })]);
  if (stopController.signal.aborted) stopController = new AbortController();
}

async function sleepUnlessStopped(ms: number): Promise<boolean> {
  if (ms <= 0) return !stopController.signal.aborted;
  try {
    await delay(ms, undefined, { signal: stopController.signal });
    return true;
  } catch {
    return false;
  }
}

async function deliver(alarm: Alarm): Promise<void> {
  const settings = await getWebhookSettings();
  if (!isWebhookActive(settings)) {
    await setWebhookResult(alarm.id, 'skipped', null);
  } else {
    const payload = buildWebhookPayload(settings.format, 'alarm.created', alarm, ctx());
    let result: SendResult = { ok: false, status: null, error: 'Not attempted (shutting down)' };
    let attempts = 0;
    for (const wait of WEBHOOK_ATTEMPT_DELAYS_MS) {
      if (!(await sleepUnlessStopped(wait))) break;
      attempts++;
      result = await postJson(settings.url, payload);
      if (result.ok || !isRetryable(result)) break;
    }
    if (result.ok) {
      await setWebhookResult(alarm.id, 'sent', null);
    } else {
      log.warn(`webhook for alarm ${alarm.id} failed after ${attempts} attempt(s): ${result.error}`);
      await setWebhookResult(alarm.id, 'failed', `${result.error} (after ${attempts} attempt${attempts === 1 ? '' : 's'})`);
    }
  }
  const updated = await findAlarm(alarm.id);
  if (updated) publish('alarm.updated', updated);
}

/**
 * Post-commit side effects of a new alarm: SSE `alarm.created`, then (if the alarm was created with
 * webhook_status 'pending') webhook delivery with retries, followed by `alarm.updated`.
 * Fire-and-forget: never throws, never blocks the caller. `after` lets callers order SSE events
 * (e.g. `gate.event` before `alarm.created`).
 */
export function announceNewAlarm(alarmId: string, webhookPending: boolean, after?: Promise<void>): void {
  track(
    (async () => {
      if (after) await after;
      const alarm = await findAlarm(alarmId);
      if (!alarm) return;
      publish('alarm.created', alarm);
      if (webhookPending) await deliver(alarm);
    })().catch((err) => log.error(`notification for alarm ${alarmId} failed`, err)),
  );
}

/** "Send test" button: one attempt to the saved URL (even if disabled) with a sample alarm. */
export async function sendTestWebhook(): Promise<SendResult> {
  const settings = await getWebhookSettings();
  if (!settings.url) return { ok: false, status: null, error: 'No webhook URL configured' };
  return postJson(settings.url, buildWebhookPayload(settings.format, 'webhook.test', sampleAlarm(), ctx()));
}
