import { Siren, X } from 'lucide-react';
import { useEffect, useRef, useState, type FocusEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAlarms } from '../api/hooks';
import type { Alarm } from '../api/types';
import { useAlarmActions } from '../live/AlarmActions';
import { useLive } from '../live/LiveProvider';
import { cx } from '../lib/cx';
import { dismissAlarm, useDismissedAlarms } from '../lib/dismissed';
import { usePrefersReducedMotion } from '../lib/hooks';
import { useFmt } from '../lib/timezone';
import { Button, ButtonLink } from './Button';
import { PlateChip } from './Plate';

/** How long the transient banner stays on the command center before it collapses (UX §4.2). */
export const FLASH_MS = 10_000;

/**
 * Global red banner (UX §4.2). Hidden on /admin/alarms.
 * - Command center (incl. wall mode): transient only. It appears for a new alarm (the takeover)
 *   and collapses into the strip's alarm chip after 10 s; pre-existing alarms never show it,
 *   because the strip chip, KPI tile, lot tile and Open alarms panel already do.
 * - Other admin pages: persistent, the newest open alarm not dismissed in this browser session.
 */
export function AlarmBanner() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin/alarms')) return null;
  const commandCenter = pathname === '/admin' || pathname === '/admin/';
  return commandCenter ? <TransientAlarmBanner /> : <PersistentAlarmBanner />;
}

function PersistentAlarmBanner() {
  const { data } = useAlarms({ status: 'open', limit: 20 });
  const dismissed = useDismissedAlarms();
  const visible = (data?.items ?? []).filter((a) => a.status === 'open' && !dismissed.includes(a.id));
  const alarm = visible[0];
  if (!alarm) return null;
  // Remounts per alarm, so the enter + sheen play once.
  return <BannerView key={alarm.id} alarm={alarm} more={visible.length - 1} />;
}

function TransientAlarmBanner() {
  const { flash, closeFlash } = useLive();
  const { data } = useAlarms({ status: 'open', limit: 20 });
  const dismissed = useDismissedAlarms();
  if (!flash || !flash.open || dismissed.includes(flash.alarm.id)) return null;
  const open = (data?.items ?? []).filter((a) => a.status === 'open' && !dismissed.includes(a.id));
  const alarm = open.find((a) => a.id === flash.alarm.id) ?? flash.alarm;
  const more = open.filter((a) => a.id !== alarm.id).length;
  return (
    // Zero-height sticky slot: the banner floats over the page head instead of pushing the
    // instruments down (and back up) for its ten seconds.
    <div className="alarm-banner-float">
      <FlashBanner key={flash.seq} alarm={alarm} more={more} onDone={() => closeFlash(flash.seq)} />
    </div>
  );
}

/** Counts down while the banner is neither hovered, focused nor in a hidden tab, then collapses. */
function FlashBanner({ alarm, more, onDone }: { alarm: Alarm; more: number; onDone: () => void }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(FLASH_MS);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const paused = hovered || focused || hidden;

  useEffect(() => {
    const sync = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    if (paused || leaving) return;
    const started = performance.now();
    const id = window.setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [paused, leaving]);

  // Collapse into the strip's alarm chip: fly towards it and shrink, then give the chip a pulse.
  useEffect(() => {
    if (!leaving) return;
    const el = ref.current;
    const chip = [...document.querySelectorAll<HTMLElement>('.strip-alarm')].find((c) => c.offsetParent !== null);
    if (!el || reduced || typeof el.animate !== 'function') {
      doneRef.current();
      return;
    }
    const from = el.getBoundingClientRect();
    const to = chip?.getBoundingClientRect();
    const dx = to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
    const dy = to ? to.top + to.height / 2 - (from.top + from.height / 2) : -24;
    const sx = to ? Math.max(0.05, to.width / from.width) : 0.9;
    const sy = to ? Math.max(0.1, to.height / from.height) : 0.9;
    const anim = el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      chip?.animate(
        [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.16)', opacity: 1, offset: 0.35 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
      doneRef.current();
    };
    return () => anim.cancel();
  }, [leaving, reduced]);

  return (
    <BannerView
      ref={ref}
      alarm={alarm}
      more={more}
      transient
      paused={paused}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    />
  );
}

interface BannerViewProps {
  alarm: Alarm;
  more: number;
  transient?: boolean;
  paused?: boolean;
  ref?: Ref<HTMLElement>;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocusCapture?: () => void;
  onBlurCapture?: (e: FocusEvent<HTMLElement>) => void;
}

function BannerView({ alarm, more, transient, paused, ref, ...handlers }: BannerViewProps) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const { openResolve } = useAlarmActions();
  const time = fmt.timeOrDateTime(alarm.occurredAt);
  const meta = alarm.gateId ? t('alarms.banner.meta', { time, gate: alarm.gateId }) : t('alarms.banner.metaNoGate', { time });

  return (
    <section
      ref={ref}
      className={cx('alarm-banner is-entering', transient && 'alarm-banner--transient', paused && 'is-paused')}
      aria-label={t('alarms.banner.regionLabel')}
      {...handlers}
    >
      <span className="siren" aria-hidden="true">
        <Siren size={22} />
      </span>
      <div className="alarm-banner__body">
        <p className="alarm-banner__title">
          <span>{t(`alarms.banner.title.${alarm.type}`)}</span>
          <PlateChip plate={alarm.plate} size="md" srPrefix />
        </p>
        <p className="alarm-banner__meta">
          <time dateTime={alarm.occurredAt} title={fmt.dateTime(alarm.occurredAt)}>
            {meta}
          </time>
          {more > 0 && (
            <>
              {' '}
              <Link to="/admin/alarms?status=open" className="alarm-banner__more">
                {t('alarms.banner.more', { count: more })}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="alarm-banner__actions">
        <Button variant="inverse" size="sm" onClick={() => openResolve(alarm)}>
          {t('alarms.banner.resolve')}
        </Button>
        <ButtonLink to={`/admin/alarms?status=open&focus=${alarm.id}`} variant="on-danger" size="sm">
          {t('alarms.banner.view')}
        </ButtonLink>
      </div>
      <button type="button" className="icon-btn alarm-banner__dismiss" aria-label={t('alarms.banner.dismiss')} onClick={() => dismissAlarm(alarm.id)}>
        <X size={18} aria-hidden="true" />
      </button>
      {transient && <i className="alarm-banner__timer" style={{ animationDuration: `${FLASH_MS}ms` }} aria-hidden="true" />}
    </section>
  );
}
