/** Types mirroring docs/ARCHITECTURE.md §5 (camelCase JSON, ISO-8601 UTC timestamps). */

export type PermitType = 'permanent' | 'daily';
export type PermitStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type PermitSource = 'admin' | 'request';
export type AlarmType = 'unauthorized_entry' | 'overstay';
export type AlarmStatus = 'open' | 'resolved';
export type WebhookStatus = 'skipped' | 'pending' | 'sent' | 'failed';
export type WebhookFormat = 'generic' | 'slack' | 'teams';
export type Direction = 'in' | 'out';
export type CheckInReason = 'PERMANENT_PERMIT' | 'DAILY_PERMIT' | 'NO_VALID_PERMIT';

export interface List<T> {
  items: T[];
  total: number;
}

export interface PermitSummary {
  id: string;
  type: PermitType;
  holderName: string;
  validDate: string | null;
}

export interface Permit {
  id: string;
  plate: string;
  plateDisplay: string;
  holderName: string;
  holderEmail: string | null;
  type: PermitType;
  validDate: string | null;
  status: PermitStatus;
  source: PermitSource;
  reference: string | null;
  requestNote: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  createdAt: string;
  updatedAt: string;
  isActiveToday: boolean;
  isDatePassed: boolean;
}

export interface GateEvent {
  id: string;
  plate: string;
  plateRaw: string;
  direction: Direction;
  occurredAt: string;
  gateId: string | null;
  authorized: boolean | null;
  permit: PermitSummary | null;
  sessionId: string | null;
  alarmId: string | null;
}

export interface ParkingSession {
  id: string;
  plate: string;
  enteredAt: string;
  exitedAt: string | null;
  durationMinutes: number;
  authorized: boolean;
  permit: PermitSummary | null;
  openAlarmId: string | null;
}

export interface Alarm {
  id: string;
  type: AlarmType;
  plate: string;
  status: AlarmStatus;
  occurredAt: string;
  gateId: string | null;
  sessionId: string | null;
  isStillParked: boolean;
  previousAlarmCount: number;
  resolvedAt: string | null;
  resolvedByName: string | null;
  resolutionNote: string | null;
  webhookStatus: WebhookStatus;
  webhookError: string | null;
  createdAt: string;
}

export interface Admin {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PublicRequestStatus {
  reference: string;
  plate: string;
  plateDisplay: string;
  holderName: string;
  type: PermitType;
  validDate: string | null;
  status: PermitStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface Health {
  status: 'ok' | 'error';
  db: 'ok' | 'error';
  time: string;
  timezone: string;
}

export interface DashboardSummary {
  parkedNow: number;
  parkedUnauthorized: number;
  openAlarms: number;
  pendingRequests: number;
  entriesToday: number;
  activePermitsToday: number;
}

export interface WebhookSettings {
  enabled: boolean;
  url: string;
  format: WebhookFormat;
}

export interface Settings {
  webhook: WebhookSettings;
  timezone: string;
  gateApiKeyHint: string;
}

export interface WebhookTestResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export interface CheckInResult {
  allowed: boolean;
  plate: string;
  reason: CheckInReason;
  permit: PermitSummary | null;
  eventId: string;
  sessionId: string;
  alarmId: string | null;
}

export interface CheckOutResult {
  plate: string;
  eventId: string;
  sessionId: string | null;
  durationMinutes: number | null;
}

export interface LoginResult {
  token: string;
  admin: Admin;
}

export interface CreateRequestResult {
  reference: string;
  token: string;
  status: 'pending';
}

// ---- request bodies ---------------------------------------------------------

export interface PermitInput {
  plate: string;
  holderName: string;
  holderEmail?: string;
  type: PermitType;
  validDate?: string;
  requestNote?: string;
}

export interface PublicRequestInput {
  plate: string;
  holderName: string;
  holderEmail: string;
  type: PermitType;
  validDate?: string;
  requestNote?: string;
}

export interface ResolveAlarmInput {
  note?: string;
  grantDailyPermit?: { holderName: string; holderEmail?: string };
}

export interface GateInput {
  plate: string;
  occurredAt?: string;
  gateId?: string;
}

// ---- query params -----------------------------------------------------------

export interface PageParams {
  limit?: number;
  offset?: number;
}

export interface PermitListParams extends PageParams {
  status?: PermitStatus;
  type?: PermitType;
  source?: PermitSource;
  q?: string;
  activeToday?: boolean;
}

export interface SessionListParams extends PageParams {
  active?: boolean;
  plate?: string;
}

export interface GateEventListParams extends PageParams {
  plate?: string;
  direction?: Direction;
  authorized?: boolean;
}

export interface AlarmListParams extends PageParams {
  status?: AlarmStatus | 'all';
  plate?: string;
}
