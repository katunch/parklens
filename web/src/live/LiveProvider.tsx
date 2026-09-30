import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { api } from '../api/endpoints';
import { toApiError } from '../api/errors';
import type { Alarm, GateEvent, Permit } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/Toast';
import { markFresh } from '../lib/fresh';
import { formatPlate } from '../lib/plate';
import { STORAGE_KEYS, storage } from '../lib/storage';
import { useFmt } from '../lib/timezone';
import { playChime } from './chime';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

export type LiveEvent =
  | { name: 'alarm.created'; data: Alarm }
  | { name: 'alarm.updated'; data: Alarm }
  | { name: 'gate.event'; data: GateEvent }
  | { name: 'permit.changed'; data: Permit }
  | { name: 'request.created'; data: Permit };

type Listener = (e: LiveEvent) => void;

/**
 * The transient alarm banner on the command center (UX §4.2): set by each takeover (a joined
 * alarm replaces the alarm and restarts the countdown), closed when it collapses, is dismissed or
 * the alarm is resolved.
 */
export interface AlarmFlash {
  seq: number;
  alarm: Alarm;
  open: boolean;
}

interface LiveContextValue {
  status: LiveStatus;
  /** Increments after every reconnect (instruments re-sync from their queries). */
  epoch: number;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  subscribe: (listener: Listener) => () => void;
  /** The Gate feed registers while it is visible, so data updates wait for its verdict (UX §4.1). */
  registerFeed: () => () => void;
  /** Called by the Gate feed when a scanned event's verdict locks. */
  commitEvent: (ev: GateEvent) => void;
  /** Takeover pulse id (changes when a new takeover starts) and the time it started. */
  takeover: { id: number; at: number };
  /** The newest alarm that started or joined a takeover, for the transient banner. */
  flash: AlarmFlash | null;
  /** Close the transient banner for this flash (it collapsed into the strip chip). */
  closeFlash: (seq: number) => void;
  /** Polite screen-reader announcement (autopilot start/stop, …). */
  announcePolite: (text: string) => void;
}

const noop = () => {};
const LiveContext = createContext<LiveContextValue>({
  status: 'connecting',
  epoch: 0,
  soundOn: false,
  setSoundOn: noop,
  subscribe: () => noop,
  registerFeed: () => noop,
  commitEvent: noop,
  takeover: { id: 0, at: 0 },
  flash: null,
  closeFlash: noop,
  announcePolite: noop,
});

export function useLive() {
  return useContext(LiveContext);
}

/** Subscribe to raw SSE events for the lifetime of a component. */
export function useLiveEvents(listener: Listener) {
  const { subscribe } = useLive();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}

/** Recreate the EventSource with this backoff after 3 consecutive errors (UX §4.1). */
const BACKOFF_MS = [2_000, 5_000, 10_000, 30_000];
const EVENTS = ['alarm.created', 'alarm.updated', 'gate.event', 'permit.changed', 'request.created'] as const;
/** Trailing debounce for refetches, so autopilot bursts don't hammer the API. */
const INVALIDATE_DEBOUNCE_MS = 300;
/** If the feed never reports a verdict (hidden, error), apply the update anyway. */
const COMMIT_FALLBACK_MS = 4_000;
/** A second alarm within this window joins the running takeover (UX §4.6). */
const TAKEOVER_JOIN_MS = 10_000;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One SSE connection per admin session (owned by the shell). It invalidates React Query caches
 * (debounced), live-pings rows, runs the alarm takeover, announces new alarms and plays the chime.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const fmt = useFmt();
  const location = useLocation();

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [epoch, setEpoch] = useState(0);
  const [assertive, setAssertive] = useState('');
  const [polite, setPolite] = useState('');
  const [takeover, setTakeover] = useState({ id: 0, at: 0 });
  const [flash, setFlash] = useState<AlarmFlash | null>(null);
  const [soundOn, setSoundOnState] = useState(() => storage.local.get(STORAGE_KEYS.alarmSound) === 'on');

  const ctx = useRef({ t, fmt, toast, pathname: location.pathname, soundOn });
  ctx.current = { t, fmt, toast, pathname: location.pathname, soundOn };

  const listeners = useRef(new Set<Listener>());
  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  // ---- debounced invalidation ---------------------------------------------
  const pendingKeys = useRef(new Map<string, QueryKey>());
  const flushTimer = useRef<number | undefined>(undefined);
  const flush = useCallback(() => {
    window.clearTimeout(flushTimer.current);
    flushTimer.current = undefined;
    const keys = [...pendingKeys.current.values()];
    pendingKeys.current.clear();
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);
  const schedule = useCallback(
    (keys: QueryKey[], delay = INVALIDATE_DEBOUNCE_MS) => {
      for (const k of keys) pendingKeys.current.set(JSON.stringify(k), k);
      window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(flush, delay);
    },
    [flush],
  );

  // ---- announcements --------------------------------------------------------
  const announceTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string) => {
    window.clearTimeout(announceTimer.current);
    setAssertive('');
    window.requestAnimationFrame(() => setAssertive(text));
    announceTimer.current = window.setTimeout(() => setAssertive(''), 5_000);
  }, []);
  const politeTimer = useRef<number | undefined>(undefined);
  const announcePolite = useCallback((text: string) => {
    window.clearTimeout(politeTimer.current);
    setPolite('');
    window.requestAnimationFrame(() => setPolite(text));
    politeTimer.current = window.setTimeout(() => setPolite(''), 5_000);
  }, []);

  // ---- takeover ---------------------------------------------------------------
  const lastTakeoverAt = useRef(0);
  const fireTakeover = useCallback((alarm: Alarm) => {
    const now = Date.now();
    if (ctx.current.soundOn) playChime();
    // The banner always switches to the newest alarm, even when it joins a running takeover.
    setFlash((p) => ({ seq: (p?.seq ?? 0) + 1, alarm, open: true }));
    if (now - lastTakeoverAt.current < TAKEOVER_JOIN_MS) return; // joins the running takeover
    lastTakeoverAt.current = now;
    setTakeover((p) => ({ id: p.id + 1, at: now }));
  }, []);
  const closeFlash = useCallback((seq: number) => {
    setFlash((p) => (p && p.seq === seq && p.open ? { ...p, open: false } : p));
  }, []);

  // ---- feed coordination (scan-first ordering) ----------------------------------
  const feedCount = useRef(0);
  const heldEvents = useRef(new Map<string, number>()); // gate event id → fallback timer
  const awaitingAlarms = useRef(new Map<string, { timer: number; alarm: Alarm }>()); // alarm id → fallback
  const committedAlarmIds = useRef(new Set<string>());
  const feedActive = () => feedCount.current > 0 && !reducedMotion();

  const registerFeed = useCallback(() => {
    feedCount.current++;
    return () => {
      feedCount.current = Math.max(0, feedCount.current - 1);
    };
  }, []);

  const releaseAlarm = useCallback(
    (alarmId: string) => {
      const waiting = awaitingAlarms.current.get(alarmId);
      if (waiting !== undefined) {
        window.clearTimeout(waiting.timer);
        awaitingAlarms.current.delete(alarmId);
        fireTakeover(waiting.alarm);
        flush();
        return true;
      }
      return false;
    },
    [fireTakeover, flush],
  );

  const commitEvent = useCallback(
    (ev: GateEvent) => {
      const timer = heldEvents.current.get(ev.id);
      if (timer !== undefined) window.clearTimeout(timer);
      heldEvents.current.delete(ev.id);
      if (ev.alarmId && !releaseAlarm(ev.alarmId)) committedAlarmIds.current.add(ev.alarmId);
      markFresh(ev.id, ev.sessionId);
      flush();
    },
    [flush, releaseAlarm],
  );

  useEffect(
    () => () => {
      window.clearTimeout(announceTimer.current);
      window.clearTimeout(politeTimer.current);
      window.clearTimeout(flushTimer.current);
    },
    [],
  );

  // ---- the EventSource --------------------------------------------------------------
  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let consecutiveErrors = 0;
    let attempt = 0;
    let everConnected = false;
    let retryTimer: number | undefined;
    let disposed = false;

    const handle = (name: (typeof EVENTS)[number], raw: string) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      const event = { name, data } as LiveEvent;
      const { t: tr, fmt: f, toast: pushToast, pathname } = ctx.current;
      const held = feedActive();
      switch (event.name) {
        case 'gate.event': {
          const ev = event.data;
          const keys: QueryKey[] = [['gate-events'], ['sessions'], ['summary'], ['timeline'], ['gates'], ['plate']];
          if (held) {
            for (const k of keys) pendingKeys.current.set(JSON.stringify(k), k);
            heldEvents.current.set(ev.id, window.setTimeout(() => commitEvent(ev), COMMIT_FALLBACK_MS));
          } else {
            markFresh(ev.id, ev.sessionId);
            schedule(keys);
          }
          break;
        }
        case 'alarm.created': {
          const alarm = event.data;
          const keys: QueryKey[] = [['summary'], ['alarms'], ['sessions'], ['gate-events'], ['timeline'], ['gates'], ['plate']];
          markFresh(alarm.id);
          // Screen readers are never delayed (UX §4.1).
          announce(tr(`alarms.announce.${alarm.type}`, { plate: formatPlate(alarm.plate), time: f.time(alarm.occurredAt) }));
          if (held && alarm.type === 'unauthorized_entry' && !committedAlarmIds.current.has(alarm.id)) {
            for (const k of keys) pendingKeys.current.set(JSON.stringify(k), k);
            awaitingAlarms.current.set(alarm.id, {
              timer: window.setTimeout(() => releaseAlarm(alarm.id), COMMIT_FALLBACK_MS),
              alarm,
            });
          } else {
            committedAlarmIds.current.delete(alarm.id);
            fireTakeover(alarm);
            schedule(keys, 80);
          }
          break;
        }
        case 'alarm.updated': {
          const updated = event.data;
          // A resolved alarm takes its transient banner with it.
          setFlash((p) => (p && p.alarm.id === updated.id ? { ...p, alarm: updated, open: p.open && updated.status === 'open' } : p));
          schedule([['summary'], ['alarms'], ['sessions'], ['plate']]);
          break;
        }
        case 'permit.changed':
          markFresh(event.data.id);
          schedule([['permits'], ['summary'], ['sessions'], ['plate']]);
          break;
        case 'request.created': {
          const p = event.data;
          markFresh(p.id);
          schedule([['permits'], ['summary'], ['plate']]);
          if (!pathname.startsWith('/admin/requests')) {
            pushToast({
              tone: 'info',
              message: tr('requests.newRequestToast', { name: p.holderName }),
              action: { label: tr('requests.review'), to: '/admin/requests' },
            });
          }
          break;
        }
      }
      listeners.current.forEach((l) => l(event));
    };

    const scheduleReconnect = () => {
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30_000;
      attempt++;
      retryTimer = window.setTimeout(async () => {
        if (disposed) return;
        // An expired session makes the stream fail forever: /auth/me turns that into a logout.
        try {
          await api.me();
        } catch (e) {
          if (toApiError(e).status === 401) return;
        }
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      consecutiveErrors = 0;
      const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
      es = source;
      source.onopen = () => {
        consecutiveErrors = 0;
        attempt = 0;
        setStatus('live');
        if (everConnected) {
          // After a reconnect anything may have been missed: refetch every admin query.
          void queryClient.invalidateQueries();
          setEpoch((e) => e + 1);
        }
        everConnected = true;
      };
      source.onerror = () => {
        if (disposed) return;
        consecutiveErrors++;
        setStatus('reconnecting');
        if (source.readyState === EventSource.CLOSED || consecutiveErrors >= 3) {
          source.close();
          scheduleReconnect();
        }
      };
      for (const name of EVENTS) {
        source.addEventListener(name, (e) => handle(name, (e as MessageEvent<string>).data));
      }
    };

    setStatus('connecting');
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      es?.close();
      heldEvents.current.forEach((id) => window.clearTimeout(id));
      heldEvents.current.clear();
      awaitingAlarms.current.forEach((w) => window.clearTimeout(w.timer));
      awaitingAlarms.current.clear();
    };
    // Reconnect only when the token changes; the handlers read everything else through refs.
  }, [token, queryClient]);

  const setSoundOn = useCallback(
    (on: boolean) => {
      storage.local.set(STORAGE_KEYS.alarmSound, on ? 'on' : 'off');
      setSoundOnState(on);
      if (on) {
        // Confirms the setting and unlocks audio under the autoplay policy.
        playChime(true);
        toast({ tone: 'info', message: t('nav.sound.enabled') });
      }
    },
    [toast, t],
  );

  const value = useMemo(
    () => ({ status, epoch, soundOn, setSoundOn, subscribe, registerFeed, commitEvent, takeover, flash, closeFlash, announcePolite }),
    [status, epoch, soundOn, setSoundOn, subscribe, registerFeed, commitEvent, takeover, flash, closeFlash, announcePolite],
  );

  return (
    <LiveContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
    </LiveContext.Provider>
  );
}
