import { useId, type CSSProperties } from 'react';
import { cx } from '../lib/cx';

interface SparklineProps {
  values: number[];
  /** CSS colour (token var). */
  color: string;
  /** Draw-on delay (first mount only). */
  delay?: number;
  animate?: boolean;
  className?: string;
}

const W = 104;
const H = 40;

/** KPI sparkline (UX §5.6): line + soft area + glowing last point; draw-on once. */
export function Sparkline({ values, color, delay = 0, animate = false, className }: SparklineProps) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return <svg className={cx('kpi__spark', className)} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const max = Math.max(...values, 1);
  const n = values.length;
  const pts = values.map((v, i) => [(i / (n - 1)) * (W - 4) + 2, H - 4 - (v / max) * (H - 10)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  return (
    <svg className={cx('kpi__spark', className)} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        className={cx('spark-area', animate && 'fade-in')}
        style={{ '--d': `${delay + 300}ms` } as CSSProperties}
        d={`${d}L${last[0]},${H}L${first[0]},${H}Z`}
        fill={`url(#sg-${id})`}
      />
      <path className={cx('spark-line', animate && 'draw')} style={{ '--d': `${delay}ms` } as CSSProperties} pathLength={1} d={d} stroke={color} />
      <circle
        className={cx('spark-dot', animate && 'fade-in')}
        style={{ '--d': `${delay + 700}ms`, '--dot': color } as CSSProperties}
        cx={last[0]}
        cy={last[1]}
        r="3"
        fill={color}
      />
    </svg>
  );
}
