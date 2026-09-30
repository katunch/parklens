import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useGateEvents, useGates } from '../../../api/hooks';
import { CountUp } from '../../../components/CountUp';
import { ErrorState } from '../../../components/EmptyState';
import { cx } from '../../../lib/cx';
import { usePrefersReducedMotion, useNow } from '../../../lib/hooks';
import { gaugeSegments } from '../../../lib/occupancy';
import { radarBlips } from '../../../lib/radar';
import { useFmt } from '../../../lib/timezone';
import { useOccupancy } from '../../../live/useOccupancy';
import { Instrument } from './shared';

const C = 116;
const R = 104;
/** Circumference in px — Chromium ignores pathLength for CSS-set dash arrays (UX §5.6). */
const ARC = 2 * Math.PI * R;
const RADAR_MS = 8_000;

const TICKS = Array.from({ length: 31 }, (_, i) => {
  const deg = i * 10;
  const major = deg % 50 === 0;
  const phi = ((120 + deg) * Math.PI) / 180;
  const r1 = 113;
  const r2 = major ? 119 : 116;
  return { key: deg, major, x1: C + r1 * Math.cos(phi), y1: C + r1 * Math.sin(phi), x2: C + r2 * Math.cos(phi), y2: C + r2 * Math.sin(phi) };
});

/** Parking-guidance plaque (dark accent): blue P, green glowing free count (UX §6 GuidancePlaque). */
export function GuidancePlaque({ free }: { free: number | undefined }) {
  const { t } = useTranslation();
  const full = free === 0;
  return (
    <span className={cx('guide', full && 'guide--full')} title={t('dashboard.gauge.freeLabel')}>
      <span className="guide__p" aria-hidden="true">
        P
      </span>
      {full ? (
        <span className="guide__n">{t('dashboard.gauge.full')}</span>
      ) : (
        <>
          <span className="guide__n">{free === undefined ? '–' : <CountUp value={free} />}</span>
          <span>{t('dashboard.gauge.free')}</span>
        </>
      )}
    </span>
  );
}

function Radar() {
  const events = useGateEvents({ limit: 100 });
  const gates = useGates();
  const fmt = useFmt();
  const now = useNow();
  const reduced = usePrefersReducedMotion();
  const sweep = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  // Pause the sweep while off-screen (UX §8 performance).
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const firstGate = useMemo(() => {
    const named = (gates.data?.items ?? []).map((g) => g.gateId).filter((g): g is string => Boolean(g));
    return named.sort()[0] ?? null;
  }, [gates.data]);

  const blips = radarBlips(events.data?.items ?? [], firstGate, now, fmt.tz);
  const phase = (() => {
    const a = sweep.current?.getAnimations?.()[0];
    const ct = a?.currentTime;
    return typeof ct === 'number' ? ct % RADAR_MS : 0;
  })();

  return (
    <div className={cx('radar', offscreen && 'is-offscreen')} ref={wrap} aria-hidden="true">
      <div className="radar__rings" />
      <div className="radar__sweep" ref={sweep} />
      {blips.map((b) => (
        <i
          key={b.id}
          className={cx('blip', b.kind === 'out' && 'blip--out', b.kind === 'denied' && 'blip--denied')}
          style={
            {
              '--a': `${b.angle}deg`,
              '--r': b.radius,
              '--o': b.opacity.toFixed(2),
              '--delay': reduced ? '0ms' : `${Math.round(((((b.angle / 360) * RADAR_MS - phase) % RADAR_MS) + RADAR_MS) % RADAR_MS)}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Occupancy gauge: 300° arc, radar, lens with count-up, guidance plaque (UX §5.6). */
export function OccupancyGauge({ index, booting }: { index: number; booting: boolean }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { occupancy: o, isError, refetch } = useOccupancy();
  const reduced = usePrefersReducedMotion();
  const [armed, setArmed] = useState(!booting || reduced);

  useEffect(() => {
    if (armed) return;
    const id = window.setTimeout(() => setArmed(true), 250);
    return () => window.clearTimeout(id);
  }, [armed]);

  const seg = o && armed ? gaugeSegments(o) : { authorizedDeg: 0, unauthorizedDeg: 0 };
  const dash = (deg: number) => `${((ARC * deg) / 360).toFixed(2)} ${ARC.toFixed(2)}`;

  return (
    <Instrument
      index={index}
      className="gauge"
      title={t('dashboard.gauge.title')}
      titleId="cc-gauge"
      meta={<GuidancePlaque free={o?.free} />}
    >
      {isError && !o ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <div className="gauge__body">
            <svg className="gauge__svg" viewBox="0 0 232 232" aria-hidden="true">
              <defs>
                <linearGradient id="g-auth" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--color-dark-primary)" />
                  <stop offset="1" stopColor="var(--color-primary)" />
                </linearGradient>
              </defs>
              {TICKS.map((k) => (
                <line key={k.key} className={cx('gauge__tick', k.major && 'gauge__tick--major')} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} />
              ))}
              <circle className="gauge__arc gauge__arc--track" cx={C} cy={C} r={R} style={{ strokeDasharray: dash(300), transform: 'rotate(120deg)', transformOrigin: `${C}px ${C}px` }} />
              <circle
                className="gauge__arc gauge__arc--a"
                cx={C}
                cy={C}
                r={R}
                style={{ strokeDasharray: dash(seg.authorizedDeg), transform: 'rotate(120deg)', transformOrigin: `${C}px ${C}px` }}
              />
              <circle
                className="gauge__arc gauge__arc--u"
                cx={C}
                cy={C}
                r={R}
                style={{
                  strokeDasharray: dash(seg.unauthorizedDeg),
                  transform: `rotate(${120 + seg.authorizedDeg}deg)`,
                  transformOrigin: `${C}px ${C}px`,
                  opacity: seg.unauthorizedDeg > 0 ? 1 : 0,
                }}
              />
            </svg>
            <Radar />
            <div
              className="lens"
              role="img"
              aria-label={o ? t('dashboard.gauge.aria', { parked: o.parked, capacity: o.capacity, unauthorized: o.unauthorized }) : t('common.loading')}
            >
              <div>
                <span className="lens__value">{o ? <CountUp value={o.parked} delay={booting ? 250 : 0} duration={1300} /> : '–'}</span>
                <span className={cx('lens__cap', o && o.over > 0 && 'lens__cap--over')}>
                  {o ? (o.over > 0 ? t('dashboard.gauge.overCapacity', { count: o.over }) : t('dashboard.gauge.ofCapacity', { capacity: fmt.number(o.capacity), percent: o.percent })) : ' '}
                </span>
              </div>
            </div>
          </div>
          <div className="gauge__foot">
            <div className="gauge__legend">
              <div>
                <i className="sw sw--auth" aria-hidden="true" />
                {t('dashboard.gauge.withPermit')}
                <b>{o ? fmt.number(o.authorized) : '–'}</b>
              </div>
              <div>
                <i className="sw sw--unauth" aria-hidden="true" />
                {t('dashboard.gauge.noPermit')}
                <b>{o ? fmt.number(o.unauthorized) : '–'}</b>
              </div>
            </div>
            <p className="caption" title={t('dashboard.gauge.radarHint')}>
              {t('dashboard.gauge.radarCaption')}
            </p>
          </div>
        </>
      )}
    </Instrument>
  );
}
