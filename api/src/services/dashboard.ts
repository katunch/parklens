import { config } from '../config.js';
import { query } from '../db.js';
import { addDays, hourInTz, todayInTz, zonedTimeToUtc } from '../lib/time.js';
import { getLotSettings } from './settings.js';

export interface DashboardSummary {
  parkedNow: number;
  parkedUnauthorized: number;
  openAlarms: number;
  pendingRequests: number;
  entriesToday: number;
  activePermitsToday: number;
  capacity: number;
}

export interface TimelineBucket {
  hour: number;
  start: string;
  entries: number;
  exits: number;
  denied: number;
  occupancy: number | null;
}

export interface DashboardTimeline {
  date: string;
  timezone: string;
  currentHour: number;
  buckets: TimelineBucket[];
}

export interface GateStatus {
  gateId: string | null;
  lastEventAt: string;
  lastDirection: 'in' | 'out';
  lastPlate: string;
  eventsToday: number;
  deniedToday: number;
}

export async function getDashboardSummary(now: Date = new Date()): Promise<DashboardSummary> {
  const today = todayInTz(config.timezone, now);
  const dayStart = zonedTimeToUtc(today, '00:00', config.timezone);
  const dayEnd = zonedTimeToUtc(addDays(today, 1), '00:00', config.timezone);
  const [{ rows }, lot] = await Promise.all([
    query<{
      parked_now: number;
      parked_unauthorized: number;
      open_alarms: number;
      pending_requests: number;
      entries_today: number;
      active_permits_today: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM parking_sessions WHERE exited_at IS NULL) AS parked_now,
         (SELECT count(*)::int FROM parking_sessions WHERE exited_at IS NULL AND NOT authorized) AS parked_unauthorized,
         (SELECT count(*)::int FROM alarms WHERE status = 'open') AS open_alarms,
         (SELECT count(*)::int FROM permits WHERE status = 'pending') AS pending_requests,
         (SELECT count(*)::int FROM gate_events
           WHERE direction = 'in' AND occurred_at >= $2 AND occurred_at < $3) AS entries_today,
         (SELECT count(*)::int FROM permits
           WHERE status = 'approved' AND (type = 'permanent' OR valid_date = $1::date)) AS active_permits_today`,
      [today, dayStart, dayEnd],
    ),
    getLotSettings(),
  ]);
  const r = rows[0]!;
  return {
    parkedNow: r.parked_now,
    parkedUnauthorized: r.parked_unauthorized,
    openAlarms: r.open_alarms,
    pendingRequests: r.pending_requests,
    entriesToday: r.entries_today,
    activePermitsToday: r.active_permits_today,
    capacity: lot.capacity,
  };
}

/** Local midnight of `$date` and of the next day as timestamptz ($1 = tz, $2 = date). */
const DAY_BOUNDS_CTE = `
  bounds AS (
    SELECT ($2::date)::timestamp AT TIME ZONE $1::text     AS day_start,
           ($2::date + 1)::timestamp AT TIME ZONE $1::text AS day_end
  )`;

/**
 * One bucket per local hour of today (23/25 on DST change days — the series runs over the real
 * instants between local midnights). Occupancy = sessions open at the bucket end (current hour: now;
 * future hours: null). Buckets are [start, start + 1h).
 */
export async function getDashboardTimeline(now: Date = new Date()): Promise<DashboardTimeline> {
  const tz = config.timezone;
  const date = todayInTz(tz, now);
  const { rows } = await query<{
    hour: number;
    start: Date;
    entries: number;
    exits: number;
    denied: number;
    occupancy: number | null;
  }>(
    `WITH ${DAY_BOUNDS_CTE},
     buckets AS (
       SELECT gs AS start,
              gs + interval '1 hour' AS stop,
              extract(hour FROM gs AT TIME ZONE $1::text)::int AS hour
       FROM bounds, generate_series(bounds.day_start, bounds.day_end - interval '1 hour', interval '1 hour') AS gs
     )
     SELECT b.hour, b.start,
            (count(e.id) FILTER (WHERE e.direction = 'in'))::int AS entries,
            (count(e.id) FILTER (WHERE e.direction = 'out'))::int AS exits,
            (count(e.id) FILTER (WHERE e.direction = 'in' AND e.authorized = false))::int AS denied,
            CASE WHEN b.start > $3::timestamptz THEN NULL ELSE (
              SELECT count(*)::int FROM parking_sessions s
              WHERE s.entered_at < LEAST(b.stop, $3::timestamptz)
                AND (s.exited_at IS NULL OR s.exited_at >= LEAST(b.stop, $3::timestamptz))
            ) END AS occupancy
     FROM buckets b
     LEFT JOIN gate_events e ON e.occurred_at >= b.start AND e.occurred_at < b.stop
     GROUP BY b.start, b.stop, b.hour
     ORDER BY b.start`,
    [tz, date, now],
  );
  return {
    date,
    timezone: tz,
    currentHour: hourInTz(now, tz),
    buckets: rows.map((r) => ({
      hour: r.hour,
      start: r.start.toISOString(),
      entries: r.entries,
      exits: r.exits,
      denied: r.denied,
      occupancy: r.occupancy,
    })),
  };
}

/**
 * Gates with events in the last 30 days (events without gateId grouped as null), most recent first.
 * Events stamped more than 5 min in the future (clock skew / simulator) don't count as "last event".
 */
export async function getGateStatuses(now: Date = new Date()): Promise<{ items: GateStatus[] }> {
  const tz = config.timezone;
  const { rows } = await query<{
    gate_id: string | null;
    occurred_at: Date;
    direction: 'in' | 'out';
    plate: string;
    events_today: number;
    denied_today: number;
  }>(
    `WITH ${DAY_BOUNDS_CTE},
     last AS (
       SELECT DISTINCT ON (e.gate_id) e.gate_id, e.occurred_at, e.direction, e.plate
       FROM gate_events e
       WHERE e.occurred_at >= $3::timestamptz - interval '30 days'
         AND e.occurred_at <= $3::timestamptz + interval '5 minutes'
       ORDER BY e.gate_id, e.occurred_at DESC, e.id DESC
     ),
     today AS (
       SELECT e.gate_id,
              count(*)::int AS events_today,
              (count(*) FILTER (WHERE e.direction = 'in' AND e.authorized = false))::int AS denied_today
       FROM gate_events e, bounds
       WHERE e.occurred_at >= bounds.day_start AND e.occurred_at < bounds.day_end
       GROUP BY e.gate_id
     )
     SELECT l.gate_id, l.occurred_at, l.direction, l.plate,
            COALESCE(t.events_today, 0) AS events_today, COALESCE(t.denied_today, 0) AS denied_today
     FROM last l
     LEFT JOIN today t ON t.gate_id IS NOT DISTINCT FROM l.gate_id
     ORDER BY l.occurred_at DESC`,
    [tz, todayInTz(tz, now), now],
  );
  return {
    items: rows.map((r) => ({
      gateId: r.gate_id,
      lastEventAt: r.occurred_at.toISOString(),
      lastDirection: r.direction,
      lastPlate: r.plate,
      eventsToday: r.events_today,
      deniedToday: r.denied_today,
    })),
  };
}
