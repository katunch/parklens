import { ArrowDownLeft, ShieldCheck } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlateChip } from '../../components/Plate';
import { cx } from '../../lib/cx';
import { usePrefersReducedMotion } from '../../lib/hooks';
import { formatPlate } from '../../lib/plate';
import { useFmt } from '../../lib/timezone';

/** Illustrative traffic for the landing hero: demo plates, every one with a permit. */
const CARS = [
  { plate: 'ZH123456', type: 'permanent', gate: 'north' },
  { plate: 'BE98765', type: 'daily', gate: 'south' },
  { plate: 'LU88214', type: 'permanent', gate: 'north' },
  { plate: 'SG1234', type: 'permanent', gate: 'south' },
  { plate: 'AG44321', type: 'daily', gate: 'north' },
  { plate: 'TI118902', type: 'permanent', gate: 'north' },
] as const;

const SCAN_MS = 1_100;
const HOLD_MS = 3_200;
const DECODE_MS = 820;
const DECODE_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const ROWS = 3;

interface Pass {
  car: number;
  at: string;
}

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

/**
 * Landing hero (UX §5.1): the gate-feed scanner as a looping illustration. A plate is decoded
 * under the lock-on brackets, the verdict stamps ALLOWED, the pass drops into a short list.
 * Decorative (aria-hidden); pauses off-screen and in hidden tabs; reduced motion shows one frame.
 */
export function ScanHero({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const reduced = usePrefersReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [current, setCurrent] = useState<Pass>(() => ({ car: 0, at: ago(0) }));
  const [phase, setPhase] = useState<'scanning' | 'locked'>('locked');
  const [rows, setRows] = useState<Pass[]>(() => [
    { car: 5, at: ago(48) },
    { car: 4, at: ago(131) },
    { car: 3, at: ago(207) },
  ]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    io.observe(el);
    const sync = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const running = !reduced && visible && !hidden;

  // The loop: hold the locked verdict, then push it into the list and scan the next car.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(
      () => {
        if (phase === 'locked') {
          setRows((r) => [current, ...r].slice(0, ROWS));
          setCurrent({ car: (current.car + 1) % CARS.length, at: ago(0) });
          setPhase('scanning');
        } else {
          setPhase('locked');
        }
      },
      phase === 'locked' ? HOLD_MS : SCAN_MS,
    );
    return () => window.clearTimeout(id);
  }, [running, phase, current]);

  // Decode the characters while scanning (fixed width, so the brackets don't jitter).
  const car = CARS[current.car]!;
  const final = formatPlate(car.plate);
  const scanning = phase === 'scanning' && running;
  useLayoutEffect(() => {
    const el = chip.current;
    const txt = el?.querySelector<HTMLElement>('.plate__txt');
    if (!el || !txt) return;
    if (!scanning) {
      txt.textContent = final;
      el.style.width = '';
      return;
    }
    txt.textContent = final;
    el.style.width = `${el.getBoundingClientRect().width}px`;
    let raf = 0;
    const t0 = performance.now();
    const n = final.length;
    const tick = (ts: number) => {
      const k = (ts - t0) / DECODE_MS;
      txt.textContent = [...final].map((ch, i) => (ch === ' ' || k > 0.25 + (i / n) * 0.75 ? ch : DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)])).join('');
      if (k < 1) raf = requestAnimationFrame(tick);
      else txt.textContent = final;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scanning, final]);

  const locked = !scanning;
  return (
    <div ref={root} className={cx('scan-hero', compact && 'scan-hero--compact')} aria-hidden="true">
      <div className="scan-hero__glow" />
      <div className="scanner scan-hero__card">
        {!compact && (
          <div className="scan-hero__head">
            <span className="scan-hero__camera">{t('landing.hero.camera')}</span>
            <span className="readout readout--live">
              <i className={cx('dot', !running && 'dot--static')} />
              {t('landing.hero.live')}
            </span>
          </div>
        )}
        <div className="stage scan-hero__stage" data-verdict={locked ? 'allowed' : undefined}>
          <div className="stage__frame" />
          <div className="stage__hud">
            <span>
              {t('landing.hero.gate')} <b>{car.gate}</b>
            </span>
            <span>{fmt.timeSeconds(current.at)}</span>
          </div>
          <div className={cx('target', scanning ? 'is-scanning' : 'is-allowed')}>
            <PlateChip ref={chip} plate={car.plate} size={compact ? 'lg' : 'xl'} state={scanning ? 'scanning' : 'allowed'} key={`${current.car}-${current.at}`}>
              {scanning && (
                <span className="beam-track">
                  <span className="beam" />
                </span>
              )}
            </PlateChip>
          </div>
          <div key={`${current.at}-${phase}`} className={cx('verdict', locked && 'verdict--allowed is-on')}>
            {locked && (
              <>
                <ShieldCheck size={14} />
                {t('dashboard.feed.verdict.allowed')}
              </>
            )}
          </div>
          <div className={cx('stage__reason', locked && 'is-on')}>{t(car.type === 'daily' ? 'landing.hero.reasonDaily' : 'landing.hero.reasonPermanent')}</div>
        </div>
        {!compact && (
          <ol className="feed scan-hero__rows">
            {rows.map((r, i) => {
              const c = CARS[r.car]!;
              return (
                <li key={r.at} className={cx('feed__row', i === 0 && running && 'is-new')}>
                  <span className="feed__time">{fmt.timeSeconds(r.at)}</span>
                  <ArrowDownLeft size={16} className="feed__dir" />
                  <span>
                    <PlateChip plate={c.plate} size="sm" />
                  </span>
                  <span className="feed__verdict feed__verdict--allowed">
                    <i />
                    {t('dashboard.feed.verdict.allowed')}
                  </span>
                  <span className="feed__gate">{c.gate}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
