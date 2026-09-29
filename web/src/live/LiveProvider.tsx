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

interface LiveContextValue {
  status: LiveStatus;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
}

const LiveContext = createContext<LiveContextValue>({ status: 'connecting', soundOn: false, setSoundOn: () => {} });

export function useLive() {
  return useContext(LiveContext);
}

/** Recreate the EventSource with this backoff after 3 consecutive errors (UX §4.1). */
const BACKOFF_MS = [2_000, 5_000, 10_000, 30_000];
const EVENTS = ['alarm.created', 'alarm.updated', 'gate.event', 'permit.changed', 'request.created'] as const;
type EventName = (typeof EVENTS)[number];

/**
 * One SSE connection per admin session (owned by the shell): invalidates React Query caches,
 * fresh-paints rows, announces new alarms (assertive live region) and plays the chime.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const fmt = useFmt();
  const location = useLocation();

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [announcement, setAnnouncement] = useState('');
  const [soundOn, setSoundOnState] = useState(() => storage.local.get(STORAGE_KEYS.alarmSound) === 'on');

  // Latest values for the long-lived event handlers.
  const ctx = useRef({ t, fmt, toast, pathname: location.pathname, soundOn });
  ctx.current = { t, fmt, toast, pathname: location.pathname, soundOn };

  const announceTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string) => {
    window.clearTimeout(announceTimer.current);
    setAnnouncement('');
    window.requestAnimationFrame(() => setAnnouncement(text));
    announceTimer.current = window.setTimeout(() => setAnnouncement(''), 5_000);
  }, []);

  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let consecutiveErrors = 0;
    let attempt = 0;
    let everConnected = false;
    let retryTimer: number | undefined;
    let disposed = false;

    const invalidate = (...keys: QueryKey[]) => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    };

    const handle = (name: EventName, raw: string) => {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      const { t: tr, fmt: f, toast: pushToast, pathname, soundOn: sound } = ctx.current;
      switch (name) {
        case 'alarm.created': {
          const alarm = data as Alarm;
          invalidate(['summary'], ['alarms'], ['sessions'], ['gate-events']);
          markFresh(alarm.id);
          announce(tr(`alarms.announce.${alarm.type}`, { plate: formatPlate(alarm.plate), time: f.time(alarm.occurredAt) }));
          if (sound) playChime();
          break;
        }
        case 'alarm.updated':
          invalidate(['summary'], ['alarms'], ['sessions']);
          break;
        case 'gate.event': {
          const ev = data as GateEvent;
          invalidate(['gate-events'], ['sessions'], ['summary']);
          markFresh(ev.id, ev.sessionId);
          break;
        }
        case 'permit.changed': {
          const p = data as Permit;
          invalidate(['permits'], ['summary'], ['sessions']);
          markFresh(p.id);
          break;
        }
        case 'request.created': {
          const p = data as Permit;
          invalidate(['permits'], ['summary']);
          markFresh(p.id);
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
        // After a reconnect, anything may have been missed: refetch every admin query.
        if (everConnected) void queryClient.invalidateQueries();
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
    };
  }, [token, queryClient, announce]);

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

  const value = useMemo(() => ({ status, soundOn, setSoundOn }), [status, soundOn, setSoundOn]);

  return (
    <LiveContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>
    </LiveContext.Provider>
  );
}
