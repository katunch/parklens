import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qk } from './endpoints';
import type { AlarmListParams, GateEventListParams, PermitListParams, SessionListParams } from './types';

/** UX §4.1 safety net: summary, timeline, gates and alarms refetch every 60 s. */
const SAFETY_NET_MS = 60_000;

export function useSummary() {
  return useQuery({ queryKey: qk.summary, queryFn: api.summary, refetchInterval: SAFETY_NET_MS });
}

export function useTimeline() {
  return useQuery({ queryKey: qk.timeline, queryFn: api.timeline, refetchInterval: SAFETY_NET_MS });
}

export function useGates() {
  return useQuery({ queryKey: qk.gates, queryFn: api.gates, refetchInterval: SAFETY_NET_MS });
}

export function useHealth(refetchInterval: number | false = SAFETY_NET_MS) {
  return useQuery({ queryKey: qk.health, queryFn: api.health, refetchInterval, retry: 0 });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 5 * 60_000 });
}

/** Active sessions for the lot map, gauge, KPI and sidebar meter (one shared source). */
export const ACTIVE_SESSIONS: SessionListParams = { active: true, limit: 200 };

export function useActiveSessions() {
  return useQuery({ queryKey: qk.sessions(ACTIVE_SESSIONS), queryFn: () => api.sessions(ACTIVE_SESSIONS) });
}

/** Approved permits valid today (KPI breakdown, autopilot pool). Cached 5 min. */
export const PERMITS_TODAY: PermitListParams = { status: 'approved', activeToday: true, limit: 200 };

export function usePermitsToday(enabled = true) {
  return useQuery({ queryKey: qk.permits(PERMITS_TODAY), queryFn: () => api.permits(PERMITS_TODAY), staleTime: 5 * 60_000, enabled });
}

export function useAlarms(params: AlarmListParams) {
  return useQuery({
    queryKey: qk.alarms(params),
    queryFn: () => api.alarms(params),
    refetchInterval: SAFETY_NET_MS,
    placeholderData: keepPreviousData,
  });
}

export function useSessions(params: SessionListParams) {
  return useQuery({ queryKey: qk.sessions(params), queryFn: () => api.sessions(params), placeholderData: keepPreviousData });
}

export function useGateEvents(params: GateEventListParams) {
  return useQuery({ queryKey: qk.gateEvents(params), queryFn: () => api.gateEvents(params), placeholderData: keepPreviousData });
}

export function usePermits(params: PermitListParams) {
  return useQuery({ queryKey: qk.permits(params), queryFn: () => api.permits(params), placeholderData: keepPreviousData });
}

export function useAdmins() {
  return useQuery({ queryKey: qk.admins, queryFn: api.admins });
}
