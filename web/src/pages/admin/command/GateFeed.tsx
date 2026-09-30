import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, qk } from '../../../api/endpoints';
import { ACTIVE_SESSIONS, useGateEvents, useGates } from '../../../api/hooks';
import type { GateEvent, GateStatus, List, ParkingSession } from '../../../api/types';
import { PlateChip } from '../../../components/Plate';
import { RelativeTime } from '../../../components/Misc';
import { cx } from '../../../lib/cx';
import { usePrefersReducedMotion, useNow } from '../../../lib/hooks';
import { formatPlate } from '../../../lib/plate';
import { useFmt, type Fmt } from '../../../lib/timezone';
import { tNode } from '../../../lib/tnode';
import { LiveReadout } from '../../../layouts/CommandStrip';
import { useLive, useLiveEvents } from '../../../live/LiveProvider';
import { useWall } from '../../../live/Wall';

const SCAN_MS = 900;
const DECODE_MS = 820;
const MIN_SLOT_MS = 1_400;
const MAX_ROWS = 8;
const DECODE_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type Phase = 'scanning' | 'locked';
interface StageState {
  ev: GateEvent;
  phase: Phase;
  reason: string;
}

type Verdict = 'allowed' | 'denied' | 'out';
const verdictOf = (e: GateEvent): Verdict => (e.direction === 'out' ? 'out' : e.authorized === false ? 'denied' : 'allowed');

/** Reason line for a stage event (UX §5.6 scan sequence, step 5). */
async function reasonFor(e: GateEvent, t: (k: string, v?: Record<string, unknown>) => string, fmt: Fmt, lookup: (e: GateEvent) => Promise<number | null>): Promise<string> {
  if (e.direction === 'in') {
    if (e.authorized === false || !e.permit) return t('simulator.result.reason.NO_VALID_PERMIT');
    return e.permit.type === 'daily' && e.permit.validDate
      ? t('simulator.result.reason.DAILY_PERMIT', { name: e.permit.holderName, date: fmt.calDate(e.permit.validDate) })
      : t('simulator.result.reason.PERMANENT_PERMIT', { name: e.permit.holderName });
  }
  if (!e.sessionId) return t('dashboard.feed.reasonOutUnknown');
  const minutes = await lookup(e);
  return minutes === null ? '' : t('dashboard.feed.reasonOut', { duration: fmt.duration(minutes) });
}

/** Gate sensor state by age of the last event (UX §5.6). */
export function sensorState(g: GateStatus, now: Date, hourLocal: number): 'active' | 'idle' | 'silent' {
  const age = now.getTime() - Date.parse(g.lastEventAt);
  if (age < 10 * 60_000) return 'active';
  if (age < 2 * 3_600_000) return 'idle';
  return hourLocal >= 6 && hourLocal < 20 ? 'silent' : 'idle';
}

function Sensors() {
  const { t } = useTranslation();
  const gates = useGates();
  const now = useNow();
  const fmt = useFmt();
  const items = gates.data?.items ?? [];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: fmt.tz }).format(now));
  const shown = [...items].sort((a, b) => String(a.gateId).localeCompare(String(b.gateId))).slice(0, 3);
  if (!items.length) return null;
  return (
    <div className="sensors">
      {shown.map((g) => {
        const state = sensorState(g, now, hour);
        const name = g.gateId ? g.gateId.charAt(0).toUpperCase() + g.gateId.slice(1) : t('dashboard.sensors.unnamed');
        return (
          <div className="sensor" key={String(g.gateId)} title={t('dashboard.sensors.hint')}>
            <i className={cx('dot', state !== 'active' && 'dot--static', state === 'idle' && 'dot--idle', state === 'silent' && 'dot--warn')} aria-hidden="true" />
            <span className="sensor__name">{name}</span>
            <span className={cx('sensor__state', `sensor__state--${state}`)}>{t(`dashboard.sensors.state.${state}`)}</span>
            <span className="sensor__meta">{tNode(t, 'dashboard.sensors.lastEvent', { time: <RelativeTime iso={g.lastEventAt} compact /> })}</span>
            <span className="sensor__meta sensor__meta--counts">
              {g.deniedToday ? t('dashboard.sensors.countsDenied', { count: g.eventsToday, denied: g.deniedToday }) : t('dashboard.sensors.counts', { count: g.eventsToday })}
            </span>
          </div>
        );
      })}
      {items.length > 3 && (
        <Link to="/admin/activity?tab=log" className="sensor sensor--more">
          {t('dashboard.sensors.more', { count: items.length - 3 })}
        </Link>
      )}
    </div>
  );
}

/** The plate on stage: scrambled at a fixed width while the beam sweeps, then decoded (rAF, no React state per frame). */
function StagePlate({ stage }: { stage: StageState }) {
  const wall = useWall();
  const ref = useRef<HTMLElement>(null);
  const final = formatPlate(stage.ev.plate);
  const scanning = stage.phase === 'scanning';

  useLayoutEffect(() => {
    const chip = ref.current;
    const txt = chip?.querySelector<HTMLElement>('.plate__txt');
    if (!chip || !txt) return;
    if (!scanning) {
      txt.textContent = final;
      chip.style.width = '';
      return;
    }
    chip.style.width = `${chip.getBoundingClientRect().width}px`;
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
  }, [scanning, final, stage.ev.id]);

  const verdict = verdictOf(stage.ev);
  const state = scanning ? 'scanning' : verdict === 'allowed' ? 'allowed' : verdict === 'denied' ? 'denied' : undefined;
  return (
    <div className={cx('target', scanning ? 'is-scanning' : `is-${verdict}`)}>
      <PlateChip ref={ref} plate={stage.ev.plate} size={wall.wall ? 'xl' : 'lg'} state={state} key={stage.ev.id}>
        {scanning && (
          <span className="beam-track" aria-hidden="true">
            <span className="beam" />
          </span>
        )}
      </PlateChip>
    </div>
  );
}

/** Gate feed (UX §5.6): dark hero instrument — sensors, camera stage with the plate scan, event list. */
export function GateFeed({ index }: { index: number }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const queryClient = useQueryClient();
  const reduced = usePrefersReducedMotion();
  const { status, epoch, registerFeed, commitEvent } = useLive();
  const events = useGateEvents({ limit: 12 });
  const [stage, setStage] = useState<StageState | null>(null);
  const [rows, setRows] = useState<GateEvent[]>([]);
  const [freshRow, setFreshRow] = useState<string | null>(null);
  const stageRef = useRef<StageState | null>(null);
  const queue = useRef<GateEvent[]>([]);
  const busy = useRef(false);
  const initEpoch = useRef<number | null>(null);
  const alive = useRef(true);
  const ctx = useRef({ t, fmt, reduced });
  ctx.current = { t, fmt, reduced };

  useEffect(() => {
    alive.current = true;
    const unregister = registerFeed();
    return () => {
      alive.current = false;
      unregister();
    };
  }, [registerFeed]);

  const lookupDuration = useCallback(
    async (e: GateEvent): Promise<number | null> => {
      const cached = queryClient.getQueryData<List<ParkingSession>>(qk.sessions(ACTIVE_SESSIONS));
      const s = cached?.items.find((x) => x.id === e.sessionId);
      if (s) return Math.max(0, Math.floor((Date.parse(e.occurredAt) - Date.parse(s.enteredAt)) / 60_000));
      try {
        const res = await api.sessions({ plate: e.plate, limit: 10 });
        const hit = res.items.find((x) => x.id === e.sessionId);
        return hit ? hit.durationMinutes : null;
      } catch {
        return null;
      }
    },
    [queryClient],
  );

  const setStageState = (s: StageState | null) => {
    stageRef.current = s;
    setStage(s);
  };

  // Initialise (and re-sync after a reconnect) from the query.
  useEffect(() => {
    if (!events.data || initEpoch.current === epoch || busy.current) return;
    initEpoch.current = epoch;
    const [first, ...rest] = events.data.items;
    setRows(rest.slice(0, MAX_ROWS));
    if (!first) {
      setStageState(null);
      return;
    }
    setStageState({ ev: first, phase: 'locked', reason: '' });
    void reasonFor(first, ctx.current.t, ctx.current.fmt, lookupDuration).then((reason) => {
      if (alive.current && stageRef.current?.ev.id === first.id) setStageState({ ev: first, phase: 'locked', reason });
    });
  }, [events.data, epoch, lookupDuration]);

  const pushRow = (e: GateEvent) => {
    setRows((r) => [e, ...r.filter((x) => x.id !== e.id)].slice(0, MAX_ROWS));
    setFreshRow(e.id);
  };

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length && alive.current) {
        // More than 3 waiting: older ones skip the animation and go straight into the list.
        while (queue.current.length > 3) {
          const skipped = queue.current.shift()!;
          pushRow(skipped);
          commitEvent(skipped);
        }
        const ev = queue.current.shift()!;
        const t0 = performance.now();
        const prev = stageRef.current;
        if (prev) pushRow(prev.ev);
        const reasonP = reasonFor(ev, ctx.current.t, ctx.current.fmt, lookupDuration);
        if (ctx.current.reduced) {
          setStageState({ ev, phase: 'locked', reason: await reasonP });
          commitEvent(ev);
          continue;
        }
        setStageState({ ev, phase: 'scanning', reason: '' });
        const [reason] = await Promise.all([reasonP, sleep(Math.max(SCAN_MS, DECODE_MS) + 80)]);
        if (!alive.current) break;
        setStageState({ ev, phase: 'locked', reason });
        commitEvent(ev);
        const rest = MIN_SLOT_MS - (performance.now() - t0);
        if (rest > 0) await sleep(rest);
      }
    } finally {
      busy.current = false;
    }
  }, [commitEvent, lookupDuration]);

  useLiveEvents((e) => {
    if (e.name !== 'gate.event') return;
    const ev = e.data;
    if (stageRef.current?.ev.id === ev.id || queue.current.some((q) => q.id === ev.id)) return;
    queue.current.push(ev);
    void pump();
  });

  const verdict = stage ? verdictOf(stage.ev) : null;
  const live = status === 'live';

  return (
    <article className="scanner" style={{ '--i': index } as CSSProperties} aria-labelledby="cc-feed">
      <div className="panel__head">
        <h2 className="panel__title" id="cc-feed">
          {t('dashboard.feed.title')}
        </h2>
        <span className="panel__meta">
          <LiveReadout status={status} />
        </span>
      </div>
      <Sensors />
      <div className={cx('stage', !live && 'stage--offline')} data-verdict={stage && stage.phase === 'locked' && verdict !== 'out' ? verdict : undefined} aria-hidden="true">
        <div className="stage__frame" />
        {stage && (
          <div className="stage__hud">
            <span>{stage.ev.gateId ? tNode(t, 'dashboard.feed.stageGate', { gate: <b>{stage.ev.gateId}</b> }) : t('dashboard.feed.stageNoGate')}</span>
            <span>{fmt.timeSeconds(stage.ev.occurredAt)}</span>
          </div>
        )}
        {stage ? (
          <>
            <StagePlate stage={stage} />
            <div key={`${stage.ev.id}-${stage.phase}`} className={cx('verdict', stage.phase === 'locked' && `verdict--${verdict} is-on`)}>
              {stage.phase === 'locked' &&
                (verdict === 'out' ? (
                  <>
                    <LogOut size={14} aria-hidden="true" />
                    {t('dashboard.feed.verdict.out')}
                  </>
                ) : verdict === 'allowed' ? (
                  <>
                    <ShieldCheck size={14} aria-hidden="true" />
                    {t('dashboard.feed.verdict.allowed')}
                  </>
                ) : (
                  <>
                    <ShieldAlert size={14} aria-hidden="true" />
                    {t('dashboard.feed.verdict.denied')}
                  </>
                ))}
            </div>
            <div className={cx('stage__reason', stage.phase === 'locked' && stage.reason && 'is-on')}>{stage.reason}</div>
          </>
        ) : (
          events.data && (
            <div className="stage__empty">
              <p className="stage__empty-title">{t('dashboard.feed.emptyTitle')}</p>
              <p>{t('dashboard.feed.emptyBody')}</p>
            </div>
          )
        )}
        {!live && <div className="stage__offline">{t('nav.live.hintDisconnected')}</div>}
      </div>
      <ol className="feed" aria-label={t('dashboard.feed.listLabel')} aria-live="polite" aria-relevant="additions">
        {rows.map((e) => {
          const v = verdictOf(e);
          const plate = formatPlate(e.plate);
          const verdictText = t(`dashboard.feed.verdict.${v}`);
          return (
            <li key={e.id} className={cx('feed__row', e.id === freshRow && 'is-new')}>
              <span className="sr-only">{t('dashboard.feed.rowAnnounce', { plate, verdict: verdictText, gate: e.gateId ?? t('common.emptyValue') })}</span>
              <span className="feed__time" aria-hidden="true">
                {fmt.timeSeconds(e.occurredAt)}
              </span>
              {e.direction === 'in' ? (
                <ArrowDownLeft size={16} className="feed__dir" aria-hidden="true" />
              ) : (
                <ArrowUpRight size={16} className="feed__dir feed__dir--out" aria-hidden="true" />
              )}
              <span aria-hidden="true">
                <PlateChip plate={e.plate} size="sm" />
              </span>
              <span className={cx('feed__verdict', v !== 'out' && `feed__verdict--${v}`)} aria-hidden="true">
                <i />
                {verdictText}
              </span>
              <span className="feed__gate" aria-hidden="true">
                {e.gateId ?? t('common.emptyValue')}
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
