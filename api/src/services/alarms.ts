import { query, SqlBuilder, withTransaction, type Queryable } from '../db.js';
import { errors } from '../lib/errors.js';
import { displayPlate, normalizePlate } from '../lib/plate.js';
import { publish } from './events.js';
import { getPermit, insertAdminPermit, LOCK_NS_PERMIT, lockPlate, today } from './permits.js';

export type AlarmType = 'unauthorized_entry' | 'overstay';
export type AlarmStatus = 'open' | 'resolved';
export type WebhookStatus = 'skipped' | 'pending' | 'sent' | 'failed';

export interface AlarmRow {
  id: string;
  type: AlarmType;
  plate: string;
  status: AlarmStatus;
  occurred_at: Date;
  gate_id: string | null;
  gate_event_id: string | null;
  session_id: string | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
  webhook_status: WebhookStatus;
  webhook_error: string | null;
  created_at: Date;
  resolved_by_name: string | null;
  is_still_parked: boolean;
  previous_alarm_count: number;
}

export interface Alarm {
  id: string;
  type: AlarmType;
  plate: string;
  status: AlarmStatus;
  occurredAt: string;
  gateId: string | null;
  sessionId: string | null;
  isStillParked: boolean;
  previousAlarmCount: number;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  webhookStatus: WebhookStatus;
  webhookError: string | null;
  createdAt: string;
}

const ALARM_SELECT = `
  SELECT a.*,
         r.name AS resolved_by_name,
         (s.id IS NOT NULL AND s.exited_at IS NULL) AS is_still_parked,
         (SELECT count(*)::int FROM alarms o
           WHERE o.plate = a.plate AND o.id <> a.id AND o.occurred_at >= now() - interval '30 days'
         ) AS previous_alarm_count
  FROM alarms a
  LEFT JOIN admins r ON r.id = a.resolved_by
  LEFT JOIN parking_sessions s ON s.id = a.session_id`;

export function toAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    type: row.type,
    plate: row.plate,
    status: row.status,
    occurredAt: row.occurred_at.toISOString(),
    gateId: row.gate_id,
    sessionId: row.session_id,
    isStillParked: row.is_still_parked,
    previousAlarmCount: row.previous_alarm_count,
    resolvedAt: row.resolved_at ? row.resolved_at.toISOString() : null,
    resolvedByName: row.resolved_by_name,
    resolutionNote: row.resolution_note,
    webhookStatus: row.webhook_status,
    webhookError: row.webhook_error,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findAlarm(id: string, db: Queryable = { query }): Promise<Alarm | undefined> {
  const { rows } = await db.query<AlarmRow>(`${ALARM_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ? toAlarm(rows[0]) : undefined;
}

export async function getAlarm(id: string): Promise<Alarm> {
  const alarm = await findAlarm(id);
  if (!alarm) throw errors.notFound('Alarm');
  return alarm;
}

export async function listAlarms(f: {
  status: 'open' | 'resolved' | 'all';
  plate?: string | undefined;
  limit: number;
  offset: number;
}): Promise<{ items: Alarm[]; total: number }> {
  const sb = new SqlBuilder();
  if (f.status !== 'all') sb.where(`a.status = ${sb.param(f.status)}`);
  const plate = f.plate ? normalizePlate(f.plate) : '';
  if (plate) sb.where(`a.plate LIKE ${sb.param(`%${plate}%`)}`);
  const where = sb.whereSql;
  const countParams = [...sb.params];
  const { rows } = await query<AlarmRow>(
    `${ALARM_SELECT} ${where}
     ORDER BY (a.status = 'open') DESC, a.occurred_at DESC, a.created_at DESC
     LIMIT ${sb.param(f.limit)} OFFSET ${sb.param(f.offset)}`,
    sb.params,
  );
  const count = await query<{ n: number }>(`SELECT count(*)::int AS n FROM alarms a ${where}`, countParams);
  return { items: rows.map(toAlarm), total: count.rows[0]?.n ?? 0 };
}

/** Insert an alarm inside an existing transaction. */
export async function insertAlarm(
  db: Queryable,
  a: {
    type: AlarmType;
    plate: string;
    occurredAt: Date;
    gateId: string | null;
    gateEventId: string | null;
    sessionId: string | null;
    webhookStatus: WebhookStatus;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO alarms (type, plate, occurred_at, gate_id, gate_event_id, session_id, webhook_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [a.type, a.plate, a.occurredAt, a.gateId, a.gateEventId, a.sessionId, a.webhookStatus],
  );
  return rows[0]!.id;
}

export async function setWebhookResult(id: string, status: WebhookStatus, error: string | null): Promise<void> {
  await query('UPDATE alarms SET webhook_status = $2, webhook_error = $3 WHERE id = $1', [
    id,
    status,
    error ? error.slice(0, 1000) : null,
  ]);
}

/**
 * Resolve an open alarm. With `grantDailyPermit`, an approved daily permit for today is created
 * (or an existing one reused) and the plate's open session is linked to it (authorized = true).
 */
export async function resolveAlarm(
  id: string,
  input: { note: string | null; grantDailyPermit: { holderName: string; holderEmail: string | null } | null },
  adminId: string,
): Promise<Alarm> {
  const { createdPermitId } = await withTransaction(async (c) => {
    const { rows } = await c.query<{ plate: string; status: AlarmStatus; plate_raw: string | null }>(
      `SELECT a.plate, a.status, COALESCE(e.plate_raw, se.plate_raw) AS plate_raw
       FROM alarms a
       LEFT JOIN gate_events e ON e.id = a.gate_event_id
       LEFT JOIN parking_sessions s ON s.id = a.session_id
       LEFT JOIN gate_events se ON se.id = s.entry_event_id
       WHERE a.id = $1
       FOR UPDATE OF a`,
      [id],
    );
    const alarm = rows[0];
    if (!alarm) throw errors.notFound('Alarm');
    if (alarm.status !== 'open') throw errors.invalidState('Alarm is already resolved');

    let createdPermitId: string | null = null;
    if (input.grantDailyPermit) {
      const todayDate = today();
      await lockPlate(c, LOCK_NS_PERMIT, alarm.plate);
      const existing = await c.query<{ id: string }>(
        `SELECT id FROM permits
         WHERE plate = $1 AND status = 'approved' AND type = 'daily' AND valid_date = $2::date
         ORDER BY created_at LIMIT 1`,
        [alarm.plate, todayDate],
      );
      let permitId = existing.rows[0]?.id;
      if (!permitId) {
        permitId = await insertAdminPermit(c, {
          plate: alarm.plate,
          plateDisplay: alarm.plate_raw ? displayPlate(alarm.plate_raw) : alarm.plate,
          holderName: input.grantDailyPermit.holderName,
          holderEmail: input.grantDailyPermit.holderEmail,
          type: 'daily',
          validDate: todayDate,
          adminId,
        });
        createdPermitId = permitId;
      }
      await c.query(
        'UPDATE parking_sessions SET authorized = true, permit_id = $2 WHERE plate = $1 AND exited_at IS NULL',
        [alarm.plate, permitId],
      );
    }

    await c.query(
      `UPDATE alarms SET status = 'resolved', resolved_at = now(), resolved_by = $2, resolution_note = $3
       WHERE id = $1`,
      [id, adminId, input.note],
    );
    return { createdPermitId };
  });

  const alarm = await getAlarm(id);
  publish('alarm.updated', alarm);
  if (createdPermitId) publish('permit.changed', await getPermit(createdPermitId));
  return alarm;
}
