import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qk } from './endpoints';
import type { AlarmListParams, GateEventListParams, PermitListParams, SessionListParams } from './types';

const SAFETY_NET_MS = 60_000;

export function useSummary() {
  return useQuery({ queryKey: qk.summary, queryFn: api.summary, refetchInterval: SAFETY_NET_MS });
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings, staleTime: 5 * 60_000 });
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
