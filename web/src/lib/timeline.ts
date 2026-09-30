import type { TimelineBucket } from '../api/types';

const HOUR_MS = 3_600_000;

/** Index of the bucket containing `now` (by `start`, DST-safe); -1 before the first, last index after the day. */
export function currentBucketIndex(buckets: TimelineBucket[], now: Date): number {
  const t = now.getTime();
  for (let i = 0; i < buckets.length; i++) {
    const start = Date.parse(buckets[i]!.start);
    if (t >= start && t < start + HOUR_MS) return i;
  }
  if (buckets.length && t < Date.parse(buckets[0]!.start)) return -1;
  return buckets.length - 1;
}

/** Position of "now" in bucket units: index + elapsed fraction of that hour. */
export function nowPosition(buckets: TimelineBucket[], now: Date): number {
  const i = currentBucketIndex(buckets, now);
  if (i < 0) return 0;
  const start = Date.parse(buckets[i]!.start);
  return i + Math.min(1, Math.max(0, (now.getTime() - start) / HOUR_MS));
}

/**
 * Replace the current bucket's occupancy with the live parked count, so the timeline agrees with
 * the gauge, KPI and lot map between refetches.
 */
export function withLiveOccupancy(buckets: TimelineBucket[], now: Date, parked: number | undefined): TimelineBucket[] {
  if (parked === undefined) return buckets;
  const i = currentBucketIndex(buckets, now);
  if (i < 0) return buckets;
  return buckets.map((b, idx) => (idx === i ? { ...b, occupancy: parked } : b));
}

export function timelineTotals(buckets: TimelineBucket[]): { entries: number; exits: number; denied: number } {
  return buckets.reduce((a, b) => ({ entries: a.entries + b.entries, exits: a.exits + b.exits, denied: a.denied + b.denied }), {
    entries: 0,
    exits: 0,
    denied: 0,
  });
}

/**
 * Sparkline values for a KPI: from the first bucket with activity (or the 05:00 bucket, whichever is
 * earlier) to the current bucket. Occupancy nulls count as 0.
 */
export function sparkSeries(buckets: TimelineBucket[], key: 'entries' | 'exits' | 'denied' | 'occupancy', now: Date): number[] {
  const cur = currentBucketIndex(buckets, now);
  if (cur < 0) return [];
  const firstActive = buckets.findIndex((b) => b.entries + b.exits > 0);
  const five = buckets.findIndex((b) => b.hour === 5);
  const candidates = [firstActive, five].filter((i) => i >= 0);
  const from = Math.min(cur, candidates.length ? Math.min(...candidates) : 0);
  return buckets.slice(from, cur + 1).map((b) => (key === 'occupancy' ? (b.occupancy ?? 0) : b[key]));
}

export interface TimelineDims {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  base: number;
  bottom: number;
}

export const TIMELINE_DIMS: TimelineDims = { width: 760, height: 164, left: 24, right: 40, top: 18, base: 106, bottom: 138 };

export interface TimelineBar {
  key: string;
  index: number;
  hour: number;
  cx: number;
  x: number;
  width: number;
  inHeight: number;
  outHeight: number;
  denied: number;
}

export interface TimelineGeometry {
  slot: number;
  bars: TimelineBar[];
  /** Occupancy line path ('' when nothing to draw). */
  line: string;
  area: string;
  last: { x: number; y: number } | null;
  xNow: number;
  yOcc: (v: number) => number;
  scaleMax: number;
  gridValues: number[];
  hourLabels: Array<{ x: number; label: string }>;
}

/** Pure SVG geometry for the "Today" instrument (UX §5.6 Activity timeline). Positions by bucket index. */
export function timelineGeometry(buckets: TimelineBucket[], now: Date, capacity: number, d: TimelineDims = TIMELINE_DIMS): TimelineGeometry {
  const n = Math.max(buckets.length, 1);
  const plotW = d.width - d.left - d.right;
  const slot = plotW / n;
  const cur = currentBucketIndex(buckets, now);
  const pos = nowPosition(buckets, now);
  const xNow = d.left + pos * slot;
  const maxIn = Math.max(6, ...buckets.map((b) => b.entries));
  const maxOut = Math.max(4, ...buckets.map((b) => b.exits));
  const unit = Math.min((d.base - d.top - 14) / maxIn, (d.bottom - d.base - 4) / maxOut);
  const bw = Math.min(14, slot * 0.46);
  const occValues = buckets.map((b) => b.occupancy ?? 0);
  const scaleMax = Math.max(capacity, ...occValues, 1);
  const yOcc = (v: number) => d.base - (v / scaleMax) * (d.base - d.top);

  const bars: TimelineBar[] = buckets.map((b, i) => {
    const cx = d.left + i * slot + slot / 2;
    return {
      key: b.start,
      index: i,
      hour: b.hour,
      cx,
      x: cx - bw / 2,
      width: bw,
      inHeight: b.entries * unit,
      outHeight: b.exits * unit,
      denied: b.denied,
    };
  });

  // Occupancy: start of day (derived exactly from bucket 0), each bucket end, then "now".
  let line = '';
  let area = '';
  let last: { x: number; y: number } | null = null;
  if (cur >= 0 && buckets.length) {
    const b0 = buckets[0]!;
    const startOcc = Math.max(0, (b0.occupancy ?? 0) - b0.entries + b0.exits);
    const pts: Array<[number, number]> = [[d.left, yOcc(startOcc)]];
    for (let i = 0; i < cur; i++) pts.push([d.left + (i + 1) * slot, yOcc(buckets[i]!.occupancy ?? 0)]);
    pts.push([xNow, yOcc(buckets[cur]!.occupancy ?? 0)]);
    const f = (v: number) => v.toFixed(1);
    line = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      const [nx, ny] = pts[i + 1]!;
      line += `Q${f(x)},${f(y)} ${f((x + nx) / 2)},${f((y + ny) / 2)}`;
    }
    const lp = pts[pts.length - 1]!;
    line += `L${f(lp[0])},${f(lp[1])}`;
    area = `${line}L${f(lp[0])},${d.base}L${d.left},${d.base}Z`;
    last = { x: lp[0], y: lp[1] };
  }

  const gridValues = [0.25, 0.5, 0.75].map((k) => Math.round(scaleMax * k)).filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  const hourLabels = buckets
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => b.hour % 3 === 0 && buckets.findIndex((o) => o.hour === b.hour) === i)
    .map(({ b, i }) => ({ x: d.left + i * slot, label: String(b.hour).padStart(2, '0') }));

  return { slot, bars, line, area, last, xNow, yOcc, scaleMax, gridValues, hourLabels };
}
