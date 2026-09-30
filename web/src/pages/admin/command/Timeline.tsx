import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useTimeline } from '../../../api/hooks';
import { ErrorState } from '../../../components/EmptyState';
import { cx } from '../../../lib/cx';
import { useNow } from '../../../lib/hooks';
import { TIMELINE_DIMS as D, timelineGeometry, timelineTotals, withLiveOccupancy } from '../../../lib/timeline';
import { useFmt } from '../../../lib/timezone';
import { useOccupancy } from '../../../live/useOccupancy';
import { Instrument } from './shared';

/** "Today" (UX §5.6 Activity timeline): hourly entries/exits, denied diamonds, occupancy line, now marker. */
export function Timeline({ index, booting }: { index: number; booting: boolean }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const timeline = useTimeline();
  const { occupancy: o } = useOccupancy();
  const scroller = useRef<HTMLDivElement>(null);
  const capacity = o?.capacity ?? 40;
  const buckets = timeline.data ? withLiveOccupancy(timeline.data.buckets, now, o?.parked) : [];
  const g = timelineGeometry(buckets, now, capacity);
  const totals = timelineTotals(buckets);
  const anim = booting;

  // Mobile: scroll "now" into view on mount (the chart scrolls horizontally inside its panel).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !timeline.data || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, (g.xNow / D.width) * el.scrollWidth - el.clientWidth / 2);
    // Only once, when the data first arrives; later refetches must not yank the scroll position.
  }, [Boolean(timeline.data)]);

  const legend = (
    <div className="legend">
      <span>
        <i className="sw sw--entries" aria-hidden="true" />
        {t('dashboard.timeline.legend.entries')}
      </span>
      <span>
        <i className="sw sw--exits" aria-hidden="true" />
        {t('dashboard.timeline.legend.exits')}
      </span>
      <span>
        <i className="sw sw--denied" aria-hidden="true" />
        {t('dashboard.timeline.legend.denied')}
      </span>
      <span>
        <i className="sw sw--occ" aria-hidden="true" />
        {t('dashboard.timeline.legend.occupancy')}
      </span>
    </div>
  );

  return (
    <Instrument
      index={index}
      className="timeline"
      title={t('dashboard.timeline.title')}
      titleId="cc-timeline"
      after={legend}
      meta={timeline.data ? <span className="tl-totals">{t('dashboard.timeline.totals', totals)}</span> : undefined}
    >
      {timeline.isError && !timeline.data ? (
        <ErrorState onRetry={() => void timeline.refetch()} />
      ) : (
        <div className="tl-scroll" ref={scroller}>
          <div role="img" aria-label={t('dashboard.timeline.aria', { parked: o?.parked ?? 0 })} className="tl-figure">
            <svg className="tl-svg" viewBox={`0 0 ${D.width} ${D.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <defs>
                <linearGradient id="g-bar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-entries)" />
                  <stop offset="1" stopColor="var(--color-primary-border)" />
                </linearGradient>
                <linearGradient id="g-occ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-occupancy-fill-top)" />
                  <stop offset="1" stopColor="var(--chart-occupancy-fill-bottom)" />
                </linearGradient>
                <pattern id="p-future" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="2" height="6" fill="var(--chart-future)" />
                </pattern>
              </defs>
              {g.gridValues.map((v) => (
                <line key={v} x1={D.left} x2={D.width - D.right} y1={g.yOcc(v)} y2={g.yOcc(v)} stroke="var(--chart-grid)" />
              ))}
              <line x1={D.left} x2={D.width - D.right} y1={g.yOcc(capacity)} y2={g.yOcc(capacity)} stroke="var(--chart-capacity)" strokeDasharray="3 4" />
              <text className="tl-axis" x={D.width - D.right + 6} y={g.yOcc(capacity) + 4}>
                {t('dashboard.timeline.capacity', { capacity })}
              </text>
              {g.gridValues[1] !== undefined && (
                <text className="tl-axis" x={D.width - D.right + 6} y={g.yOcc(g.gridValues[1]) + 4}>
                  {g.gridValues[1]}
                </text>
              )}
              <text className="tl-axis" x={D.width - D.right + 6} y={D.base + 4}>
                0
              </text>
              {timeline.data && <rect x={g.xNow} y={D.top - 8} width={Math.max(0, D.width - D.right - g.xNow)} height={D.bottom - D.top + 8} fill="url(#p-future)" />}
              <line x1={D.left} x2={D.width - D.right} y1={D.base} y2={D.base} stroke="var(--gauge-tick)" />
              {g.area && <path d={g.area} fill="url(#g-occ)" className={cx(anim && 'fade-in')} style={{ '--d': '400ms' } as CSSProperties} />}
              {g.line && <path d={g.line} className={cx('tl-occ', anim && 'draw')} pathLength={1} style={{ '--d': '250ms' } as CSSProperties} />}
              {g.bars.map((b) => (
                <g key={b.key}>
                  {b.inHeight > 0 && (
                    <rect
                      className={cx('tl-bar', 'tl-bar--in', anim && 'tl-grow')}
                      style={{ '--d': `${b.index * 22}ms` } as CSSProperties}
                      x={b.x}
                      y={D.base - b.inHeight}
                      width={b.width}
                      height={b.inHeight}
                      rx="2.5"
                    />
                  )}
                  {b.outHeight > 0 && (
                    <rect
                      className={cx('tl-bar', 'tl-bar--out', anim && 'tl-grow')}
                      style={{ '--d': `${b.index * 22}ms` } as CSSProperties}
                      x={b.x}
                      y={D.base + 1}
                      width={b.width}
                      height={b.outHeight}
                      rx="2.5"
                    />
                  )}
                  {b.denied > 0 && (
                    <rect
                      className={cx('tl-denied', anim && 'fade-in')}
                      x={b.cx - 3.5}
                      y={D.base - b.inHeight - 11}
                      width="7"
                      height="7"
                      rx="1.5"
                      transform={`rotate(45 ${b.cx} ${D.base - b.inHeight - 7.5})`}
                    />
                  )}
                </g>
              ))}
              {g.hourLabels.map((l) => (
                <text key={l.x} className="tl-axis" x={l.x} y={D.height - 6}>
                  {l.label}
                </text>
              ))}
              {timeline.data && (
                <>
                  <line x1={g.xNow} x2={g.xNow} y1={D.top - 6} y2={D.bottom + 2} className="tl-now-line" />
                  <g transform={`translate(${g.xNow} ${D.top - 12})`}>
                    <rect x="-20" y="-9" width="40" height="17" rx="5" className="tl-now-chip" />
                    <text x="0" y="3.5" textAnchor="middle" className="tl-now-text">
                      {fmt.time(now.toISOString())}
                    </text>
                  </g>
                </>
              )}
              {g.last && (
                <>
                  <circle className="tl-now-halo" cx={g.last.x} cy={g.last.y} r="4" />
                  <circle className="tl-now-dot" cx={g.last.x} cy={g.last.y} r="4" />
                </>
              )}
            </svg>
          </div>
          {timeline.data && (
            <table className="sr-only">
              <caption>{t('dashboard.timeline.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('dashboard.timeline.hourColumn')}</th>
                  <th scope="col">{t('dashboard.timeline.legend.entries')}</th>
                  <th scope="col">{t('dashboard.timeline.legend.exits')}</th>
                  <th scope="col">{t('dashboard.timeline.legend.denied')}</th>
                  <th scope="col">{t('dashboard.timeline.legend.occupancy')}</th>
                </tr>
              </thead>
              <tbody>
                {buckets
                  .filter((b) => b.occupancy !== null)
                  .map((b) => (
                    <tr key={b.start}>
                      <th scope="row">{`${String(b.hour).padStart(2, '0')}:00`}</th>
                      <td>{b.entries}</td>
                      <td>{b.exits}</td>
                      <td>{b.denied}</td>
                      <td>{b.occupancy}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Instrument>
  );
}
