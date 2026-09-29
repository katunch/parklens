import { config } from '../config.js';
import { escapeLike, query, SqlBuilder, withTransaction, type Queryable } from '../db.js';
import { errors } from '../lib/errors.js';
import { generatePublicToken, generateReference } from '../lib/ids.js';
import { normalizePlate, parsePlate } from '../lib/plate.js';
import { addDays, todayInTz } from '../lib/time.js';
import type { CreatePermitInput, PublicRequestInput } from '../schemas.js';
import { publish } from './events.js';

export type PermitType = 'permanent' | 'daily';
export type PermitStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type PermitSource = 'admin' | 'request';

export const MAX_DAYS_AHEAD_ADMIN = 365;
export const MAX_DAYS_AHEAD_REQUEST = 60;

export interface PermitRow {
  id: string;
  plate: string;
  plate_display: string;
  holder_name: string;
  holder_email: string | null;
  type: PermitType;
  valid_date: string | null;
  status: PermitStatus;
  source: PermitSource;
  reference: string | null;
  public_token: string | null;
  request_note: string | null;
  decision_note: string | null;
  decided_at: Date | null;
  decided_by: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  decided_by_name?: string | null;
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

const PERMIT_SELECT = `
  SELECT p.*, d.name AS decided_by_name
  FROM permits p
  LEFT JOIN admins d ON d.id = p.decided_by`;

export const today = (): string => todayInTz(config.timezone);

export function toPermit(row: PermitRow, todayDate: string = today()): Permit {
  return {
    id: row.id,
    plate: row.plate,
    plateDisplay: row.plate_display,
    holderName: row.holder_name,
    holderEmail: row.holder_email,
    type: row.type,
    validDate: row.valid_date,
    status: row.status,
    source: row.source,
    reference: row.reference,
    requestNote: row.request_note,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    decidedByName: row.decided_by_name ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    isActiveToday: row.status === 'approved' && (row.type === 'permanent' || row.valid_date === todayDate),
    isDatePassed: row.type === 'daily' && row.valid_date !== null && row.valid_date < todayDate,
  };
}

export function toPermitSummary(p: {
  id: string;
  type: PermitType;
  holder_name: string;
  valid_date: string | null;
}): PermitSummary {
  return { id: p.id, type: p.type, holderName: p.holder_name, validDate: p.valid_date };
}

/** Builds a PermitSummary from prefixed join columns (p_id, p_type, ...) or null. */
export function joinedPermitSummary(row: {
  p_id: string | null;
  p_type: PermitType | null;
  p_holder_name: string | null;
  p_valid_date: string | null;
}): PermitSummary | null {
  if (!row.p_id || !row.p_type) return null;
  return { id: row.p_id, type: row.p_type, holderName: row.p_holder_name ?? '', validDate: row.p_valid_date };
}

function toPublicStatus(row: PermitRow): PublicRequestStatus {
  return {
    reference: row.reference ?? '',
    plate: row.plate,
    plateDisplay: row.plate_display,
    holderName: row.holder_name,
    type: row.type,
    validDate: row.valid_date,
    status: row.status,
    decisionNote: row.decision_note,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Helpers shared with gate / alarms / seed
// ---------------------------------------------------------------------------

export const LOCK_NS_PERMIT = 1;
export const LOCK_NS_GATE = 2;

/** Serialize work per plate within the current transaction. */
export async function lockPlate(db: Queryable, namespace: number, plate: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))', [namespace, plate]);
}

/** The permit that authorizes `plate` on calendar day `date` (permanent preferred). */
export async function findValidPermit(
  db: Queryable,
  plate: string,
  date: string,
): Promise<Pick<PermitRow, 'id' | 'type' | 'holder_name' | 'valid_date'> | undefined> {
  const { rows } = await db.query<Pick<PermitRow, 'id' | 'type' | 'holder_name' | 'valid_date'>>(
    `SELECT id, type, holder_name, valid_date
     FROM permits
     WHERE plate = $1 AND status = 'approved'
       AND (type = 'permanent' OR (type = 'daily' AND valid_date = $2::date))
     ORDER BY (type = 'permanent') DESC, created_at DESC
     LIMIT 1`,
    [plate, date],
  );
  return rows[0];
}

/** 409 ALREADY_PERMITTED if an approved permanent (or approved daily for the same date) exists. */
async function assertNotAlreadyPermitted(
  db: Queryable,
  plate: string,
  type: PermitType,
  validDate: string | null,
): Promise<void> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM permits
     WHERE plate = $1 AND status = 'approved'
       AND (type = 'permanent' OR ($2::text = 'daily' AND type = 'daily' AND valid_date = $3::date))
     LIMIT 1`,
    [plate, type, validDate],
  );
  if (rowCount) throw errors.alreadyPermitted();
}

function assertDateRange(date: string, todayDate: string, maxDays: number): void {
  if (date < todayDate) throw errors.dateInPast();
  if (date > addDays(todayDate, maxDays)) throw errors.dateTooFar(maxDays);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPermitRow(db: Queryable, id: string): Promise<PermitRow | undefined> {
  const { rows } = await db.query<PermitRow>(`${PERMIT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0];
}

export async function getPermit(id: string): Promise<Permit> {
  const row = await getPermitRow({ query }, id);
  if (!row) throw errors.notFound('Permit');
  return toPermit(row);
}

export interface ListPermitsFilter {
  status?: PermitStatus | undefined;
  type?: PermitType | undefined;
  source?: PermitSource | undefined;
  q?: string | undefined;
  activeToday?: boolean | undefined;
  limit: number;
  offset: number;
}

export async function listPermits(f: ListPermitsFilter): Promise<{ items: Permit[]; total: number }> {
  const todayDate = today();
  const sb = new SqlBuilder();
  if (f.status) sb.where(`p.status = ${sb.param(f.status)}`);
  if (f.type) sb.where(`p.type = ${sb.param(f.type)}`);
  if (f.source) sb.where(`p.source = ${sb.param(f.source)}`);
  if (f.activeToday) {
    sb.where(`p.status = 'approved' AND (p.type = 'permanent' OR p.valid_date = ${sb.param(todayDate)}::date)`);
  }
  if (f.q) {
    const namePattern = sb.param(`%${escapeLike(f.q)}%`);
    const plateQ = normalizePlate(f.q);
    sb.where(
      plateQ
        ? `(p.plate LIKE ${sb.param(`%${plateQ}%`)} OR p.holder_name ILIKE ${namePattern} ESCAPE '\\')`
        : `p.holder_name ILIKE ${namePattern} ESCAPE '\\'`,
    );
  }
  const order = f.status === 'pending' ? 'p.created_at ASC, p.id ASC' : 'p.created_at DESC, p.id DESC';
  const where = sb.whereSql;
  const countParams = [...sb.params];
  const { rows } = await query<PermitRow>(
    `${PERMIT_SELECT} ${where} ORDER BY ${order} LIMIT ${sb.param(f.limit)} OFFSET ${sb.param(f.offset)}`,
    sb.params,
  );
  const count = await query<{ n: number }>(`SELECT count(*)::int AS n FROM permits p ${where}`, countParams);
  return { items: rows.map((r) => toPermit(r, todayDate)), total: count.rows[0]?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Insert an approved admin permit inside an existing transaction (no duplicate check). */
export async function insertAdminPermit(
  db: Queryable,
  p: {
    plate: string;
    plateDisplay: string;
    holderName: string;
    holderEmail: string | null;
    type: PermitType;
    validDate: string | null;
    requestNote?: string | null;
    adminId: string | null;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO permits (plate, plate_display, holder_name, holder_email, type, valid_date, status, source,
                          request_note, decided_at, decided_by, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', 'admin', $7, now(), $8, $8)
     RETURNING id`,
    [p.plate, p.plateDisplay, p.holderName, p.holderEmail, p.type, p.validDate, p.requestNote ?? null, p.adminId],
  );
  return rows[0]!.id;
}

export async function createAdminPermit(input: CreatePermitInput, adminId: string): Promise<Permit> {
  const { plate, plateDisplay } = parsePlate(input.plate);
  const todayDate = today();
  if (input.type === 'daily' && input.validDate) assertDateRange(input.validDate, todayDate, MAX_DAYS_AHEAD_ADMIN);

  const id = await withTransaction(async (c) => {
    await lockPlate(c, LOCK_NS_PERMIT, plate);
    await assertNotAlreadyPermitted(c, plate, input.type, input.validDate);
    return insertAdminPermit(c, {
      plate,
      plateDisplay,
      holderName: input.holderName,
      holderEmail: input.holderEmail,
      type: input.type,
      validDate: input.validDate,
      requestNote: input.requestNote,
      adminId,
    });
  });
  const permit = await getPermit(id);
  publish('permit.changed', permit);
  return permit;
}

/** Insert a request-sourced permit (pending by default) with a fresh reference + token. */
export async function insertRequestPermit(
  db: Queryable,
  p: {
    plate: string;
    plateDisplay: string;
    holderName: string;
    holderEmail: string;
    type: PermitType;
    validDate: string | null;
    requestNote: string | null;
    createdAt?: Date;
  },
): Promise<PermitRow> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const { rows } = await db.query<PermitRow>(
      `INSERT INTO permits (plate, plate_display, holder_name, holder_email, type, valid_date, status, source,
                            reference, public_token, request_note, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'request', $7, $8, $9, $10, $10)
       ON CONFLICT (reference) DO NOTHING
       RETURNING *`,
      [
        p.plate,
        p.plateDisplay,
        p.holderName,
        p.holderEmail,
        p.type,
        p.validDate,
        generateReference(),
        generatePublicToken(),
        p.requestNote,
        p.createdAt ?? new Date(),
      ],
    );
    if (rows[0]) return rows[0];
  }
  throw new Error('could not allocate a unique request reference');
}

export async function createPublicRequest(
  input: PublicRequestInput,
): Promise<{ reference: string; token: string; status: 'pending' }> {
  const { plate, plateDisplay } = parsePlate(input.plate);
  if (input.type === 'daily' && input.validDate) assertDateRange(input.validDate, today(), MAX_DAYS_AHEAD_REQUEST);

  const row = await withTransaction(async (c) => {
    await lockPlate(c, LOCK_NS_PERMIT, plate);
    const dup = await c.query(
      `SELECT 1 FROM permits
       WHERE plate = $1 AND status = 'pending' AND type = $2 AND valid_date IS NOT DISTINCT FROM $3::date
       LIMIT 1`,
      [plate, input.type, input.validDate],
    );
    if (dup.rowCount) throw errors.duplicateRequest();
    await assertNotAlreadyPermitted(c, plate, input.type, input.validDate);
    return insertRequestPermit(c, {
      plate,
      plateDisplay,
      holderName: input.holderName,
      holderEmail: input.holderEmail,
      type: input.type,
      validDate: input.validDate,
      requestNote: input.requestNote,
    });
  });

  publish('request.created', toPermit(row));
  return { reference: row.reference!, token: row.public_token!, status: 'pending' };
}

export async function getPublicRequestByToken(token: string): Promise<PublicRequestStatus> {
  const { rows } = await query<PermitRow>(
    `SELECT * FROM permits WHERE public_token = $1 AND source = 'request'`,
    [token],
  );
  if (!rows[0]) throw errors.notFound('Request');
  return toPublicStatus(rows[0]);
}

export async function lookupPublicRequest(
  reference: string,
  plateInput: string,
): Promise<PublicRequestStatus & { token: string }> {
  let ref = reference.trim().toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(ref)) ref = `PL-${ref}`;
  const { plate } = parsePlate(plateInput);
  const { rows } = await query<PermitRow>(
    `SELECT * FROM permits WHERE reference = $1 AND plate = $2 AND source = 'request'`,
    [ref, plate],
  );
  const row = rows[0];
  if (!row || !row.public_token) throw errors.notFound('Request');
  return { ...toPublicStatus(row), token: row.public_token };
}

export async function updatePermit(
  id: string,
  patch: { holderName?: string | undefined; holderEmail?: string | null | undefined },
): Promise<Permit> {
  const setEmail = patch.holderEmail !== undefined;
  const { rowCount } = await query(
    `UPDATE permits
     SET holder_name = COALESCE($2, holder_name),
         holder_email = CASE WHEN $3::boolean THEN $4 ELSE holder_email END,
         updated_at = now()
     WHERE id = $1`,
    [id, patch.holderName ?? null, setEmail, patch.holderEmail ? patch.holderEmail : null],
  );
  if (!rowCount) throw errors.notFound('Permit');
  const permit = await getPermit(id);
  publish('permit.changed', permit);
  return permit;
}

export type Decision = 'approve' | 'reject' | 'revoke';

const DECISIONS: Record<Decision, { from: PermitStatus; to: PermitStatus; verb: string }> = {
  approve: { from: 'pending', to: 'approved', verb: 'approved' },
  reject: { from: 'pending', to: 'rejected', verb: 'rejected' },
  revoke: { from: 'approved', to: 'revoked', verb: 'revoked' },
};

export async function decidePermit(
  id: string,
  decision: Decision,
  note: string | null,
  adminId: string,
): Promise<Permit> {
  const d = DECISIONS[decision];
  await withTransaction(async (c) => {
    const { rows } = await c.query<PermitRow>('SELECT * FROM permits WHERE id = $1 FOR UPDATE', [id]);
    const p = rows[0];
    if (!p) throw errors.notFound('Permit');
    if (p.status !== d.from) {
      throw errors.invalidState(`Only ${d.from} permits can be ${d.verb} (current status: ${p.status})`);
    }
    if (decision === 'approve' && p.type === 'daily' && p.valid_date && p.valid_date < today()) {
      throw errors.dateInPast();
    }
    await c.query(
      `UPDATE permits
       SET status = $2, decision_note = COALESCE($3, decision_note), decided_at = now(), decided_by = $4,
           updated_at = now()
       WHERE id = $1`,
      [id, d.to, note, adminId],
    );
  });
  const permit = await getPermit(id);
  publish('permit.changed', permit);
  return permit;
}
