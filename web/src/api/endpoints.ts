import { http } from './client';
import type {
  Admin,
  Alarm,
  AlarmListParams,
  CheckInResult,
  CheckOutResult,
  CreateRequestResult,
  DashboardSummary,
  GateEvent,
  GateEventListParams,
  GateInput,
  Health,
  List,
  LoginResult,
  ParkingSession,
  Permit,
  PermitInput,
  PermitListParams,
  PublicRequestInput,
  PublicRequestStatus,
  ResolveAlarmInput,
  SessionListParams,
  Settings,
  WebhookSettings,
  WebhookTestResult,
} from './types';

const enc = encodeURIComponent;

/** Every endpoint of ARCHITECTURE.md §5, typed. */
export const api = {
  // public
  health: () => http.get<Health>('/health', { auth: false }),
  createRequest: (body: PublicRequestInput) => http.post<CreateRequestResult>('/public/requests', body, { auth: false }),
  getRequest: (token: string) => http.get<PublicRequestStatus>(`/public/requests/${enc(token)}`, { auth: false }),
  lookupRequest: (body: { reference: string; plate: string }) =>
    http.post<PublicRequestStatus & { token: string }>('/public/requests/lookup', body, { auth: false }),

  // auth
  login: (body: { email: string; password: string }) => http.post<LoginResult>('/auth/login', body, { auth: false }),
  me: () => http.get<Admin>('/auth/me'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    http.post<void>('/auth/change-password', body),

  // admin
  summary: () => http.get<DashboardSummary>('/dashboard/summary'),

  permits: (params: PermitListParams) => http.get<List<Permit>>('/permits', { query: params }),
  permit: (id: string) => http.get<Permit>(`/permits/${enc(id)}`),
  createPermit: (body: PermitInput) => http.post<Permit>('/permits', body),
  updatePermit: (id: string, body: { holderName?: string; holderEmail?: string | null }) =>
    http.patch<Permit>(`/permits/${enc(id)}`, body),
  approvePermit: (id: string, decisionNote?: string) =>
    http.post<Permit>(`/permits/${enc(id)}/approve`, decisionNote ? { decisionNote } : {}),
  rejectPermit: (id: string, decisionNote?: string) =>
    http.post<Permit>(`/permits/${enc(id)}/reject`, decisionNote ? { decisionNote } : {}),
  revokePermit: (id: string, decisionNote?: string) =>
    http.post<Permit>(`/permits/${enc(id)}/revoke`, decisionNote ? { decisionNote } : {}),

  sessions: (params: SessionListParams) => http.get<List<ParkingSession>>('/sessions', { query: params }),
  gateEvents: (params: GateEventListParams) => http.get<List<GateEvent>>('/gate-events', { query: params }),

  alarms: (params: AlarmListParams) => http.get<List<Alarm>>('/alarms', { query: params }),
  alarm: (id: string) => http.get<Alarm>(`/alarms/${enc(id)}`),
  resolveAlarm: (id: string, body: ResolveAlarmInput) => http.post<Alarm>(`/alarms/${enc(id)}/resolve`, body),

  settings: () => http.get<Settings>('/settings'),
  saveSettings: (webhook: WebhookSettings) => http.put<Settings>('/settings', { webhook }),
  testWebhook: () => http.post<WebhookTestResult>('/settings/webhook/test'),

  admins: () => http.get<List<Admin>>('/admins'),
  createAdmin: (body: { email: string; name: string; password: string }) => http.post<Admin>('/admins', body),
  deleteAdmin: (id: string) => http.delete<void>(`/admins/${enc(id)}`),

  // gate (the simulator authenticates with the admin bearer token)
  checkIn: (body: GateInput) => http.post<CheckInResult>('/gate/check-in', body),
  checkOut: (body: GateInput) => http.post<CheckOutResult>('/gate/check-out', body),
};

/** React Query keys (UX §8). SSE invalidation matches on the first segment. */
export const qk = {
  summary: ['summary'] as const,
  alarms: (p?: AlarmListParams) => (p ? (['alarms', p] as const) : (['alarms'] as const)),
  alarm: (id: string) => ['alarms', 'detail', id] as const,
  sessions: (p?: SessionListParams) => (p ? (['sessions', p] as const) : (['sessions'] as const)),
  gateEvents: (p?: GateEventListParams) => (p ? (['gate-events', p] as const) : (['gate-events'] as const)),
  permits: (p?: PermitListParams) => (p ? (['permits', p] as const) : (['permits'] as const)),
  permit: (id: string) => ['permits', 'detail', id] as const,
  settings: ['settings'] as const,
  admins: ['admins'] as const,
  publicRequest: (token: string) => ['public-request', token] as const,
  health: ['health'] as const,
};
