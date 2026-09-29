import { config } from '../config.js';
import { query } from '../db.js';
import { log } from '../lib/log.js';
import { todayInTz } from '../lib/time.js';
import { getWebhookSettings, isWebhookActive } from '../services/settings.js';
import { announceNewAlarm } from '../services/webhook.js';

export const OVERSTAY_INTERVAL_MS = 60_000;

/**
 * Creates one 'overstay' alarm per open session whose daily permit's day has ended
 * (valid_date < today in APP_TIMEZONE). The partial unique index makes this idempotent.
 * Returns the number of alarms created.
 */
export async function runOverstayCheck(now: Date = new Date()): Promise<number> {
  const today = todayInTz(config.timezone, now);
  const { rows } = await query<{ id: string; plate: string }>(
    `SELECT s.id, s.plate
     FROM parking_sessions s
     JOIN permits p ON p.id = s.permit_id
     WHERE s.exited_at IS NULL
       AND p.type = 'daily' AND p.valid_date < $1::date
       AND NOT EXISTS (SELECT 1 FROM alarms a WHERE a.session_id = s.id AND a.type = 'overstay')
     ORDER BY s.entered_at`,
    [today],
  );
  if (rows.length === 0) return 0;

  const webhookPending = isWebhookActive(await getWebhookSettings());
  let created = 0;
  for (const s of rows) {
    const ins = await query<{ id: string }>(
      `INSERT INTO alarms (type, plate, occurred_at, session_id, webhook_status)
       VALUES ('overstay', $1, $2, $3, $4)
       ON CONFLICT (session_id, type) WHERE type = 'overstay' DO NOTHING
       RETURNING id`,
      [s.plate, now, s.id, webhookPending ? 'pending' : 'skipped'],
    );
    const id = ins.rows[0]?.id;
    if (id) {
      created++;
      log.info(`overstay alarm ${id} for ${s.plate}`);
      announceNewAlarm(id, webhookPending);
    }
  }
  return created;
}

let timer: NodeJS.Timeout | undefined;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runOverstayCheck();
  } catch (err) {
    log.error('overstay check failed', err);
  } finally {
    running = false;
  }
}

export function startOverstayJob(intervalMs = OVERSTAY_INTERVAL_MS): void {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
}

export function stopOverstayJob(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
