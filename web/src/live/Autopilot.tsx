import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, qk } from '../api/endpoints';
import { errorKey, toApiError } from '../api/errors';
import { ACTIVE_SESSIONS, PERMITS_TODAY } from '../api/hooks';
import type { DashboardSummary, GateStatus, List, ParkingSession, Permit } from '../api/types';
import { useToast } from '../components/Toast';
import { nextDelay, planStep, type Pace } from '../lib/autopilot';
import { addSimResult } from '../lib/simResults';
import { STORAGE_KEYS, storage } from '../lib/storage';
import { useLive } from './LiveProvider';

interface AutopilotState {
  on: boolean;
  pace: Pace;
  startedAt: string | null;
  sent: number;
  alarms: number;
}

interface AutopilotContextValue extends AutopilotState {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  setPace: (pace: Pace) => void;
}

const INITIAL: AutopilotState = { on: false, pace: 'calm', startedAt: null, sent: 0, alarms: 0 };

const AutopilotContext = createContext<AutopilotContextValue>({
  ...INITIAL,
  start: () => {},
  stop: () => {},
  toggle: () => {},
  setPace: () => {},
});

export function useAutopilot() {
  return useContext(AutopilotContext);
}

/**
 * Simulator autopilot (UX §12). Lives in the admin shell next to the SSE provider, so it survives
 * navigation. Uses the admin JWT against the gate endpoints, one request in flight at a time.
 */
export function AutopilotProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { announcePolite } = useLive();
  const [state, setState] = useState<AutopilotState>(() => ({ ...INITIAL, ...storage.session.getJson<Partial<AutopilotState>>(STORAGE_KEYS.autopilot, {}) }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const errors = useRef(0);
  const lastUnknownAt = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);

  useEffect(() => {
    storage.session.setJson(STORAGE_KEYS.autopilot, state);
  }, [state]);

  const tick = useCallback(async () => {
    if (!stateRef.current.on || inFlight.current) return;
    inFlight.current = true;
    try {
      const [permits, sessions, summary, gates] = await Promise.all([
        queryClient.fetchQuery({ queryKey: qk.permits(PERMITS_TODAY), queryFn: () => api.permits(PERMITS_TODAY), staleTime: 5 * 60_000 }),
        queryClient.fetchQuery({ queryKey: qk.sessions(ACTIVE_SESSIONS), queryFn: () => api.sessions(ACTIVE_SESSIONS), staleTime: 2_000 }) as Promise<List<ParkingSession>>,
        queryClient.fetchQuery({ queryKey: qk.summary, queryFn: api.summary, staleTime: 5_000 }) as Promise<DashboardSummary>,
        queryClient.fetchQuery({ queryKey: qk.gates, queryFn: api.gates, staleTime: 30_000 }) as Promise<{ items: GateStatus[] }>,
      ]);
      const plan = planStep({
        permitted: (permits as List<Permit>).items.map((p) => ({ plate: p.plate, plateDisplay: p.plateDisplay })),
        parked: sessions.items.map((s) => ({ plate: s.plate, authorized: s.authorized, enteredAt: s.enteredAt })),
        capacity: summary.capacity,
        now: Date.now(),
        lastUnknownAt: lastUnknownAt.current,
        gates: gates.items.map((g) => ({ gateId: g.gateId, eventsToday: g.eventsToday })),
      });
      if (!plan || !stateRef.current.on) return;
      const at = new Date().toISOString();
      if (plan.kind === 'in') {
        if (plan.unknown) lastUnknownAt.current = Date.now();
        const res = await api.checkIn({ plate: plan.plate, gateId: plan.gateId });
        addSimResult({ id: `sim-${res.eventId}`, kind: 'in', at, gate: plan.gateId, res, autopilot: true });
        setState((s) => ({ ...s, sent: s.sent + 1, alarms: s.alarms + (res.alarmId ? 1 : 0) }));
      } else {
        const res = await api.checkOut({ plate: plan.plate, gateId: plan.gateId });
        addSimResult({ id: `sim-${res.eventId}`, kind: 'out', at, gate: plan.gateId, res, autopilot: true });
        setState((s) => ({ ...s, sent: s.sent + 1 }));
      }
      errors.current = 0;
    } catch (e) {
      const err = toApiError(e);
      if (err.status === 401) return; // the client already logged out
      errors.current++;
      if (errors.current >= 3) {
        errors.current = 0;
        setState((s) => ({ ...s, on: false }));
        toast({ tone: 'danger', message: t('autopilot.paused', { error: t(errorKey(err)) }) });
      }
    } finally {
      inFlight.current = false;
    }
  }, [queryClient, t, toast]);

  // The loop: one tick per pace interval while on.
  useEffect(() => {
    if (!state.on) return;
    let cancelled = false;
    const loop = (delay: number) => {
      timer.current = window.setTimeout(async () => {
        if (cancelled) return;
        await tick();
        if (!cancelled) loop(nextDelay(stateRef.current.pace));
      }, delay);
    };
    loop(1_500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [state.on, tick]);

  const start = useCallback(() => {
    if (stateRef.current.on) return;
    errors.current = 0;
    setState((s) => ({ ...s, on: true, startedAt: new Date().toISOString(), sent: 0, alarms: 0 }));
    announcePolite(t('autopilot.started'));
  }, [announcePolite, t]);

  const stop = useCallback(() => {
    if (!stateRef.current.on) return;
    setState((s) => ({ ...s, on: false }));
    announcePolite(t('autopilot.stopped'));
  }, [announcePolite, t]);

  const toggle = useCallback(() => (stateRef.current.on ? stop() : start()), [start, stop]);
  const setPace = useCallback((pace: Pace) => setState((s) => ({ ...s, pace })), []);

  const value = useMemo(() => ({ ...state, start, stop, toggle, setPace }), [state, start, stop, toggle, setPace]);
  return <AutopilotContext.Provider value={value}>{children}</AutopilotContext.Provider>;
}
