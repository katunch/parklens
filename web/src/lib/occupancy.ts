/**
 * Occupancy maths for the command center. Parked count, unauthorized count, capacity, percentage,
 * free spaces, gauge segments and the sidebar meter all come from here, from ONE source: the
 * active sessions list plus `summary.capacity` (architect note: the numbers must always agree).
 */

export interface SessionLike {
  authorized: boolean;
}

export interface Occupancy {
  parked: number;
  unauthorized: number;
  authorized: number;
  capacity: number;
  free: number;
  /** Cars over capacity (0 when within capacity). */
  over: number;
  /** Rounded percentage of capacity (can exceed 100). */
  percent: number;
}

/**
 * @param total   `sessions.total` for `active=true` (exact parked count)
 * @param items   the active sessions returned (≤ limit)
 * @param capacity lot capacity (≥ 1)
 * @param fallbackUnauthorized used only when not every session was returned (total > items)
 */
export function computeOccupancy(total: number, items: SessionLike[], capacity: number, fallbackUnauthorized?: number): Occupancy {
  const parked = Math.max(0, total);
  const counted = items.filter((s) => !s.authorized).length;
  const unauthorized = Math.min(parked, items.length >= parked ? counted : Math.max(counted, fallbackUnauthorized ?? counted));
  const cap = Math.max(1, Math.floor(capacity));
  return {
    parked,
    unauthorized,
    authorized: parked - unauthorized,
    capacity: cap,
    free: Math.max(0, cap - parked),
    over: Math.max(0, parked - cap),
    percent: Math.round((parked * 100) / cap),
  };
}

/**
 * Gauge arc (UX §5.6): a 300° arc; authorized segment then unauthorized segment. When the lot is
 * over capacity the arc is full and both segments share it proportionally.
 */
export function gaugeSegments(o: Occupancy, arcDeg = 300): { authorizedDeg: number; unauthorizedDeg: number } {
  const scale = Math.max(o.capacity, o.parked, 1);
  return {
    authorizedDeg: (arcDeg * o.authorized) / scale,
    unauthorizedDeg: (arcDeg * o.unauthorized) / scale,
  };
}

/** Sidebar lot meter widths in percent. */
export function meterWidths(o: Occupancy): { authorized: number; unauthorized: number } {
  const scale = Math.max(o.capacity, o.parked, 1);
  return { authorized: (o.authorized * 100) / scale, unauthorized: (o.unauthorized * 100) / scale };
}

/** Lot map layout by capacity (UX §5.6): drawn bays ≤ 60, compact grid 61–200, waffle > 200. */
export function lotLayout(capacity: number): 'bays' | 'grid' | 'waffle' {
  if (capacity <= 60) return 'bays';
  if (capacity <= 200) return 'grid';
  return 'waffle';
}
