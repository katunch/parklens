import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useActiveSessions, useSummary } from '../../../api/hooks';
import type { ParkingSession } from '../../../api/types';
import { ErrorState } from '../../../components/EmptyState';
import { PlateChip } from '../../../components/Plate';
import { Tooltip } from '../../../components/Tooltip';
import { useDossier } from '../../../dossier/PlateDossier';
import { cx } from '../../../lib/cx';
import { minutesSince } from '../../../lib/format';
import { useFresh } from '../../../lib/fresh';
import { useNow } from '../../../lib/hooks';
import { assignSlots, type SlotMap } from '../../../lib/lotSlots';
import { lotLayout } from '../../../lib/occupancy';
import { formatPlate } from '../../../lib/plate';
import { useFmt } from '../../../lib/timezone';
import { Instrument } from './shared';

/** sessionId → slot survives navigation within the session; a reload reassigns compactly. */
let slotMemory: SlotMap | null = null;

type TileKind = 'permanent' | 'daily' | 'none';
const kindOf = (s: ParkingSession): TileKind => (!s.authorized || !s.permit ? 'none' : s.permit.type === 'daily' ? 'daily' : 'permanent');

function useSlots(sessions: ParkingSession[] | undefined) {
  const next = useMemo(() => (sessions ? assignSlots(slotMemory, sessions) : null), [sessions]);
  useEffect(() => {
    if (next) slotMemory = next;
  }, [next]);
  return next;
}

interface TileHandlers {
  onEnter: (e: PointerEvent<HTMLElement>, s: ParkingSession) => void;
  onLeave: () => void;
  onFocus: (e: FocusEvent<HTMLElement>, s: ParkingSession) => void;
  onBlur: () => void;
  onOpen: (s: ParkingSession) => void;
  tipId: string;
  tipFor: string | null;
}

function Car({ session, side, h }: { session: ParkingSession; side: 'top' | 'bottom'; h: TileHandlers }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const isFresh = useFresh();
  const kind = kindOf(session);
  const plate = formatPlate(session.plate);
  const holder = session.permit?.holderName ?? t('dashboard.lot.unknownVehicle');
  const permit = t(`dashboard.lot.tooltip.${kind === 'none' ? 'none' : kind}`);
  const dy = side === 'top' ? -16 : 16;
  return (
    <motion.button
      type="button"
      className={cx('car', kind === 'daily' && 'car--daily', kind === 'none' && 'car--unauth', kind === 'none' && session.openAlarmId && 'car--alarm')}
      initial={{ opacity: 0, y: dy, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.62, ease: [0.34, 1.56, 0.64, 1] } }}
      exit={{ opacity: 0, y: dy, scale: 0.85, transition: { duration: 0.36, ease: [0.4, 0, 1, 1] } }}
      whileHover={{ y: -2, transition: { duration: 0.14 } }}
      whileFocus={{ y: -2, transition: { duration: 0.14 } }}
      aria-label={t('dashboard.lot.tileLabel', { plate, holder, permit, duration: fmt.duration(minutesSince(session.enteredAt, now)) })}
      aria-describedby={h.tipFor === session.id ? h.tipId : undefined}
      onPointerEnter={(e) => h.onEnter(e, session)}
      onPointerLeave={h.onLeave}
      onFocus={(e) => h.onFocus(e, session)}
      onBlur={h.onBlur}
      onClick={() => h.onOpen(session)}
      translate="no"
    >
      <span className="car__label" aria-hidden="true">
        {session.plate.slice(0, 2)}
      </span>
      <i className="reticle" aria-hidden="true" />
      {kind === 'none' && (
        <span className="car__flag" aria-hidden="true">
          !
        </span>
      )}
      {isFresh(session.id) && <i className="ping" aria-hidden="true" />}
    </motion.button>
  );
}

function Bay({ session, side, h, last }: { session: ParkingSession | undefined; side: 'top' | 'bottom'; h: TileHandlers; last: boolean }) {
  return (
    <div className={cx('bay', last && 'bay--last')}>
      <AnimatePresence initial={false}>{session && <Car key={session.id} session={session} side={side} h={h} />}</AnimatePresence>
    </div>
  );
}

/** Lot map (UX §5.6): one symbolic tile per parked car, in arrival order. */
export function LotMap({ index }: { index: number }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const now = useNow();
  const sessions = useActiveSessions();
  const summary = useSummary();
  const dossier = useDossier();
  const slots = useSlots(sessions.data?.items);
  const tipId = useId();
  const [tip, setTip] = useState<{ el: HTMLElement; session: ParkingSession } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTip(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const handlers: TileHandlers = {
    tipId,
    tipFor: tip?.session.id ?? null,
    onEnter: (e, s) => {
      const el = e.currentTarget;
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => setTip({ el, session: s }), 150);
    },
    onLeave: () => {
      window.clearTimeout(hoverTimer.current);
      setTip(null);
    },
    onFocus: (e, s) => setTip({ el: e.currentTarget, session: s }),
    onBlur: () => setTip(null),
    onOpen: (s) => {
      setTip(null);
      dossier.open(s.plate);
    },
  };

  const capacity = summary.data?.capacity ?? 40;
  const layout = lotLayout(capacity);
  const bySlot = useMemo(() => {
    const m = new Map<number, ParkingSession>();
    for (const s of sessions.data?.items ?? []) {
      const e = slots?.get(s.id);
      if (e) m.set(e.slot, s);
    }
    return m;
  }, [sessions.data, slots]);
  const overflow = [...bySlot.entries()].filter(([slot]) => slot >= capacity).sort((a, b) => a[0] - b[0]);

  const legend = (
    <div className="legend">
      <span>
        <i className="sw sw--permanent" aria-hidden="true" />
        {t('dashboard.lot.legend.permanent')}
      </span>
      <span>
        <i className="sw sw--daily" aria-hidden="true" />
        {t('dashboard.lot.legend.daily')}
      </span>
      <span>
        <i className="sw sw--none" aria-hidden="true" />
        {t('dashboard.lot.legend.none')}
      </span>
    </div>
  );

  let map;
  if (sessions.isError && !sessions.data) {
    map = <ErrorState onRetry={() => void sessions.refetch()} />;
  } else if (layout === 'bays') {
    const rows = Math.ceil(capacity / 10);
    const blocks = Math.ceil(rows / 2);
    map = (
      <div className="lotmap" role="group" aria-label={t('dashboard.lot.title')} data-blocks={blocks}>
        {Array.from({ length: blocks }, (_, b) => {
          const topRow = b * 2;
          const bottomRow = topRow + 1;
          const bays = (row: number) => Math.max(0, Math.min(10, capacity - row * 10));
          return (
            <div className="lot-block" key={b}>
              <div className="bays bays--top" style={{ '--n': bays(topRow) } as CSSProperties}>
                {Array.from({ length: bays(topRow) }, (_, c) => (
                  <Bay key={c} session={bySlot.get(topRow * 10 + c)} side="top" h={handlers} last={c === bays(topRow) - 1} />
                ))}
              </div>
              <div className="aisle" aria-hidden="true" />
              <div className="bays bays--bottom" style={{ '--n': bays(bottomRow) } as CSSProperties}>
                {Array.from({ length: bays(bottomRow) }, (_, c) => (
                  <Bay key={c} session={bySlot.get(bottomRow * 10 + c)} side="bottom" h={handlers} last={c === bays(bottomRow) - 1} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (layout === 'grid') {
    map = (
      <div className="lotgrid" role="group" aria-label={t('dashboard.lot.title')}>
        {Array.from({ length: capacity }, (_, i) => {
          const s = bySlot.get(i);
          return (
            <div className="lotgrid__cell" key={i}>
              <AnimatePresence initial={false}>{s && <Car key={s.id} session={s} side="top" h={handlers} />}</AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  } else {
    // > 200: 100-cell waffle, each cell = capacity/100 spaces, coloured by share.
    const items = sessions.data?.items ?? [];
    const counts = { permanent: 0, daily: 0, none: 0 };
    for (const s of items) counts[kindOf(s)]++;
    const per = capacity / 100;
    const kinds: Array<TileKind | 'free'> = Array.from({ length: 100 }, (_, i) => {
      const mid = (i + 0.5) * per;
      if (mid <= counts.permanent) return 'permanent';
      if (mid <= counts.permanent + counts.daily) return 'daily';
      if (mid <= counts.permanent + counts.daily + counts.none) return 'none';
      return 'free';
    });
    map = (
      <Link to="/admin/activity" className="waffle" aria-label={t('dashboard.lot.title')}>
        {kinds.map((k, i) => (
          <i key={i} className={`waffle__cell waffle__cell--${k}`} aria-hidden="true" />
        ))}
      </Link>
    );
  }

  const tipSession = tip?.session;
  const tipKind = tipSession ? kindOf(tipSession) : 'none';

  return (
    <Instrument index={index} className="lot" title={t('dashboard.lot.title')} titleId="cc-lot" meta={legend}>
      {map}
      {overflow.length > 0 && layout !== 'waffle' && (
        <div className="lot-overflow" role="group" aria-label={t('dashboard.lot.overflow', { count: overflow.length })}>
          <span className="lot-overflow__pill">{t('dashboard.lot.overflow', { count: overflow.length })}</span>
          {overflow.map(([slot, s]) => (
            <div className="bay bay--overflow" key={slot}>
              <Car session={s} side="top" h={handlers} />
            </div>
          ))}
        </div>
      )}
      <p className="caption lot__caption">{t('dashboard.lot.caption')}</p>
      <Tooltip anchor={tip?.el ?? null} id={tipId}>
        {tipSession && (
          <>
            <div className="tip__row">
              <PlateChip plate={tipSession.plate} size="sm" />
              <span className="tip__name">{tipSession.permit?.holderName ?? t('dashboard.lot.unknownVehicle')}</span>
            </div>
            <div className={cx('tip__meta', tipKind === 'none' && 'tip__meta--danger')}>
              {tipKind === 'none'
                ? tipSession.openAlarmId
                  ? t('dashboard.lot.tooltip.noneAlarm')
                  : t('dashboard.lot.tooltip.none')
                : t(`dashboard.lot.tooltip.${tipKind}`)}
            </div>
            <div className="tip__meta">
              {t('dashboard.lot.tooltip.parkedSince', { duration: fmt.duration(minutesSince(tipSession.enteredAt, now)), time: fmt.time(tipSession.enteredAt) })}
            </div>
            <div className="tip__hint">{t('dashboard.lot.tooltip.hint')}</div>
          </>
        )}
      </Tooltip>
    </Instrument>
  );
}
