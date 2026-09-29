import { config } from '../config.js';
import { query } from '../db.js';
import { addDays, todayInTz, zonedTimeToUtc } from '../lib/time.js';

export interface DashboardSummary {
  parkedNow: number;
  parkedUnauthorized: number;
  openAlarms: number;
  pendingRequests: number;
  entriesToday: number;
  activePermitsToday: number;
}

export async function getDashboardSummary(now: Date = new Date()): Promise<DashboardSummary> {
  const today = todayInTz(config.timezone, now);
  const dayStart = zonedTimeToUtc(today, '00:00', config.timezone);
  const dayEnd = zonedTimeToUtc(addDays(today, 1), '00:00', config.timezone);
  const { rows } = await query<{
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
  );
  const r = rows[0]!;
  return {
    parkedNow: r.parked_now,
    parkedUnauthorized: r.parked_unauthorized,
    openAlarms: r.open_alarms,
    pendingRequests: r.pending_requests,
    entriesToday: r.entries_today,
    activePermitsToday: r.active_permits_today,
  };
}
