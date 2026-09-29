import { config } from '../config.js';
import { query, SqlBuilder, withTransaction, type Queryable } from '../db.js';
import { log } from '../lib/log.js';
import { normalizePlate, parsePlate } from '../lib/plate.js';
import { dateInTz, minutesBetween } from '../lib/time.js';
import { insertAlarm } from './alarms.js';
import { hasSubscribers, publish } from './events.js';
import {
  findValidPermit,
  joinedPermitSummary,
  LOCK_NS_GATE,
  lockPlate,
  toPermitSummary,
  type PermitSummary,
  type PermitType,
} from './permits.js';
import { getWebhookSettings, isWebhookActive } from './settings.js';
import { announceNewAlarm } from './webhook.js';

export interface GateInput {
  plate: string;
  occurredAt: Date;
  gateId: string | null;
}

export type CheckInReason = 'PERMANENT_PERMIT' | 'DAILY_PERMIT' | 'NO_VALID_PERMIT';

export interface CheckInResult {
  allowed: boolean;
  plate: string;
  reason: CheckInReason;
  permit: PermitSummary | null;
  eventId: string;
  sessionId: string;
  alarmId: string | null;
}

export interface CheckOutResult {
  plate: string;
  eventId: string;
  sessionId: string | null;
  durationMinutes: number | null;
}

interface PermitJoinCols {
  p_id: string | null;
  p_type: PermitType | null;
  p_holder_name: string | null;
  p_valid_date: string | null;
}

export interface GateEvent {
  id: string;
  plate: string;
  plateRaw: string;
  direction: 'in' | 'out';
  occurredAt: string;
  gateId: string | null;
  authorized: boolean | null;
  permit: PermitSummary | null;
  sessionId: string | null;
  alarmId: string | null;
}

export interface ParkingSession {
  id: string;
  plate: string;
  enteredAt: string;
  exitedAt: string | null;
  durationMinutes: number;
  authorized: boolean;
  permit: PermitSummary | null;
  openAlarmId: string | null;
}

// ---------------------------------------------------------------------------
// Check-in / check-out
// ---------------------------------------------------------------------------

/**
 * Check-in inside a transaction: record the gate event, close a still-open session for the plate
 * ('superseded'), open a new session and — if no valid permit — create an unauthorized_entry alarm.
 * `webhook: false` forces webhook_status 'skipped' (demo seed).
 */
export async function checkInTx(
  c: Queryable,
  input: GateInput,
  opts: { webhook: boolean } = { webhook: true },
): Promise<{ result: CheckInResult; webhookPending: boolean }> {
  const { plate } = parsePlate(input.plate);
  await lockPlate(c, LOCK_NS_GATE, plate);

  const permit = await findValidPermit(c, plate, dateInTz(input.occurredAt, config.timezone));
  const authorized = permit !== undefined;

  const ev = await c.query<{ id: string }>(
    `INSERT INTO gate_events (plate, plate_raw, direction, occurred_at, gate_id, authorized, permit_id)
     VALUES ($1, $2, 'in', $3, $4, $5, $6) RETURNING id`,
    [plate, input.plate, input.occurredAt, input.gateId, authorized, permit?.id ?? null],
  );
  const eventId = ev.rows[0]!.id;

  await c.query(
    `UPDATE parking_sessions SET exited_at = GREATEST(entered_at, $2), closed_reason = 'superseded'
     WHERE plate = $1 AND exited_at IS NULL`,
    [plate, input.occurredAt],
  );
  const session = await c.query<{ id: string }>(
    `INSERT INTO parking_sessions (plate, entered_at, entry_event_id, permit_id, authorized)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [plate, input.occurredAt, eventId, permit?.id ?? null, authorized],
  );
  const sessionId = session.rows[0]!.id;
  await c.query('UPDATE gate_events SET session_id = $2 WHERE id = $1', [eventId, sessionId]);

  let alarmId: string | null = null;
  let webhookPending = false;
  if (!authorized) {
    webhookPending = opts.webhook && isWebhookActive(await getWebhookSettings(c));
    alarmId = await insertAlarm(c, {
      type: 'unauthorized_entry',
      plate,
      occurredAt: input.occurredAt,
      gateId: input.gateId,
      gateEventId: eventId,
      sessionId,
      webhookStatus: webhookPending ? 'pending' : 'skipped',
    });
  }

  return {
    result: {
      allowed: authorized,
      plate,
      reason: !permit ? 'NO_VALID_PERMIT' : permit.type === 'permanent' ? 'PERMANENT_PERMIT' : 'DAILY_PERMIT',
      permit: permit ? toPermitSummary(permit) : null,
      eventId,
      sessionId,
      alarmId,
    },
    webhookPending,
  };
}

export async function checkOutTx(c: Queryable, input: GateInput): Promise<CheckOutResult> {
  const { plate } = parsePlate(input.plate);
  await lockPlate(c, LOCK_NS_GATE, plate);

  const ev = await c.query<{ id: string }>(
    `INSERT INTO gate_events (plate, plate_raw, direction, occurred_at, gate_id, authorized)
     VALUES ($1, $2, 'out', $3, $4, NULL) RETURNING id`,
    [plate, input.plate, input.occurredAt, input.gateId],
  );
  const eventId = ev.rows[0]!.id;

  const closed = await c.query<{ id: string; entered_at: Date; exited_at: Date; permit_id: string | null }>(
    `UPDATE parking_sessions
     SET exited_at = GREATEST(entered_at, $2), exit_event_id = $3, closed_reason = 'exit'
     WHERE plate = $1 AND exited_at IS NULL
     RETURNING id, entered_at, exited_at, permit_id`,
    [plate, input.occurredAt, eventId],
  );
  const s = closed.rows[0];
  if (!s) return { plate, eventId, sessionId: null, durationMinutes: null };

  await c.query('UPDATE gate_events SET session_id = $2, permit_id = $3 WHERE id = $1', [eventId, s.id, s.permit_id]);
  return { plate, eventId, sessionId: s.id, durationMinutes: minutesBetween(s.entered_at, s.exited_at) };
}

async function publishGateEvent(eventId: string): Promise<void> {
  try {
    if (!hasSubscribers()) return;
    const ev = await findGateEvent(eventId);
    if (ev) publish('gate.event', ev);
  } catch (err) {
    log.error(`failed to publish gate event ${eventId}`, err);
  }
}

export async function checkIn(input: GateInput): Promise<CheckInResult> {
  const { result, webhookPending } = await withTransaction((c) => checkInTx(c, input));
  const published = publishGateEvent(result.eventId);
  if (result.alarmId) announceNewAlarm(result.alarmId, webhookPending, published);
  return result;
}

export async function checkOut(input: GateInput): Promise<CheckOutResult> {
  const result = await withTransaction((c) => checkOutTx(c, input));
  void publishGateEvent(result.eventId);
  return result;
}

// ---------------------------------------------------------------------------
// Gate events
// ---------------------------------------------------------------------------

interface GateEventRow extends PermitJoinCols {
  id: string;
  plate: string;
  plate_raw: string;
  direction: 'in' | 'out';
  occurred_at: Date;
  gate_id: string | null;
  authorized: boolean | null;
  session_id: string | null;
  alarm_id: string | null;
}

const GATE_EVENT_SELECT = `
  SELECT e.id, e.plate, e.plate_raw, e.direction, e.occurred_at, e.gate_id, e.authorized, e.session_id,
         p.id AS p_id, p.type AS p_type, p.holder_name AS p_holder_name, p.valid_date AS p_valid_date,
         (SELECT a.id FROM alarms a WHERE a.gate_event_id = e.id ORDER BY a.created_at LIMIT 1) AS alarm_id
  FROM gate_events e
  LEFT JOIN permits p ON p.id = e.permit_id`;

function toGateEvent(r: GateEventRow): GateEvent {
  return {
    id: String(r.id),
    plate: r.plate,
    plateRaw: r.plate_raw,
    direction: r.direction,
    occurredAt: r.occurred_at.toISOString(),
    gateId: r.gate_id,
    authorized: r.direction === 'out' ? null : r.authorized,
    permit: joinedPermitSummary(r),
    sessionId: r.session_id,
    alarmId: r.alarm_id,
  };
}

export async function findGateEvent(id: string): Promise<GateEvent | undefined> {
  const { rows } = await query<GateEventRow>(`${GATE_EVENT_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] ? toGateEvent(rows[0]) : undefined;
}

export async function listGateEvents(f: {
  plate?: string | undefined;
  direction?: 'in' | 'out' | undefined;
  authorized?: boolean | undefined;
  limit: number;
  offset: number;
}): Promise<{ items: GateEvent[]; total: number }> {
  const sb = new SqlBuilder();
  const plate = f.plate ? normalizePlate(f.plate) : '';
  if (plate) sb.where(`e.plate LIKE ${sb.param(`%${plate}%`)}`);
  if (f.direction) sb.where(`e.direction = ${sb.param(f.direction)}`);
  if (f.authorized !== undefined) sb.where(`e.authorized = ${sb.param(f.authorized)}`);
  const where = sb.whereSql;
  const countParams = [...sb.params];
  const { rows } = await query<GateEventRow>(
    `${GATE_EVENT_SELECT} ${where} ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT ${sb.param(f.limit)} OFFSET ${sb.param(f.offset)}`,
    sb.params,
  );
  const count = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gate_events e ${where}`, countParams);
  return { items: rows.map(toGateEvent), total: count.rows[0]?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Parking sessions
// ---------------------------------------------------------------------------

interface SessionRow extends PermitJoinCols {
  id: string;
  plate: string;
  entered_at: Date;
  exited_at: Date | null;
  authorized: boolean;
  open_alarm_id: string | null;
}

const SESSION_SELECT = `
  SELECT s.id, s.plate, s.entered_at, s.exited_at, s.authorized,
         p.id AS p_id, p.type AS p_type, p.holder_name AS p_holder_name, p.valid_date AS p_valid_date,
         (SELECT a.id FROM alarms a WHERE a.session_id = s.id AND a.status = 'open'
           ORDER BY a.occurred_at DESC LIMIT 1) AS open_alarm_id
  FROM parking_sessions s
  LEFT JOIN permits p ON p.id = s.permit_id`;

function toSession(r: SessionRow, now: Date): ParkingSession {
  return {
    id: r.id,
    plate: r.plate,
    enteredAt: r.entered_at.toISOString(),
    exitedAt: r.exited_at ? r.exited_at.toISOString() : null,
    durationMinutes: minutesBetween(r.entered_at, r.exited_at ?? now),
    authorized: r.authorized,
    permit: joinedPermitSummary(r),
    openAlarmId: r.open_alarm_id,
  };
}

export async function listSessions(f: {
  active?: boolean | undefined;
  plate?: string | undefined;
  limit: number;
  offset: number;
}): Promise<{ items: ParkingSession[]; total: number }> {
  const sb = new SqlBuilder();
  if (f.active === true) sb.where('s.exited_at IS NULL');
  if (f.active === false) sb.where('s.exited_at IS NOT NULL');
  const plate = f.plate ? normalizePlate(f.plate) : '';
  if (plate) sb.where(`s.plate LIKE ${sb.param(`%${plate}%`)}`);
  const where = sb.whereSql;
  const countParams = [...sb.params];
  const { rows } = await query<SessionRow>(
    `${SESSION_SELECT} ${where} ORDER BY s.entered_at DESC, s.id
     LIMIT ${sb.param(f.limit)} OFFSET ${sb.param(f.offset)}`,
    sb.params,
  );
  const count = await query<{ n: number }>(`SELECT count(*)::int AS n FROM parking_sessions s ${where}`, countParams);
  const now = new Date();
  return { items: rows.map((r) => toSession(r, now)), total: count.rows[0]?.n ?? 0 };
}
