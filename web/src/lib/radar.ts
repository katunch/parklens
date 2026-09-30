/**
 * Radar blips (UX §5.6 Occupancy gauge): gate events of the last 60 min placed like a clock face.
 * angle = minute × 6° + second × 0.1° (in the app timezone); first gate on the inner ring, others outer.
 */

export interface RadarEvent {
  id: string;
  occurredAt: string;
  direction: 'in' | 'out';
  authorized: boolean | null;
  gateId: string | null;
}

export interface Blip {
  id: string;
  angle: number;
  /** Distance from the centre as a fraction of the radar radius. */
  radius: number;
  opacity: number;
  kind: 'in' | 'out' | 'denied';
}

const WINDOW_MS = 60 * 60_000;
const minuteFormatters = new Map<string, Intl.DateTimeFormat>();

function minuteSecond(d: Date, timeZone: string): { m: number; s: number } {
  let f = minuteFormatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone, minute: '2-digit', second: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', { minute: '2-digit', second: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    }
    minuteFormatters.set(timeZone, f);
  }
  let m = 0;
  let s = 0;
  for (const p of f.formatToParts(d)) {
    if (p.type === 'minute') m = Number(p.value);
    if (p.type === 'second') s = Number(p.value);
  }
  return { m, s };
}

export function radarBlips(events: RadarEvent[], firstGate: string | null | undefined, now: Date, timeZone: string): Blip[] {
  const t = now.getTime();
  return events
    .filter((e) => {
      const age = t - Date.parse(e.occurredAt);
      return age >= 0 && age < WINDOW_MS;
    })
    .map((e, i) => {
      const d = new Date(e.occurredAt);
      const { m, s } = minuteSecond(d, timeZone);
      const age = (t - d.getTime()) / 3_600_000;
      const inner = firstGate !== undefined && e.gateId === firstGate;
      const jitter = (((i * 7) % 9) - 4) / 80;
      return {
        id: e.id,
        angle: m * 6 + s * 0.1,
        radius: (inner ? 0.475 : 0.8) + jitter,
        opacity: Math.max(0.35, Math.min(0.95, 0.95 - age * 0.6)),
        kind: e.direction === 'out' ? 'out' : e.authorized === false ? 'denied' : 'in',
      };
    });
}
