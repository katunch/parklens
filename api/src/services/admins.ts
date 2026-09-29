import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { isUniqueViolation, query, withTransaction } from '../db.js';
import { errors } from '../lib/errors.js';
import { log } from '../lib/log.js';

const BCRYPT_ROUNDS = 10;

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
  last_login_at: Date | null;
}

export interface Admin {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toAdmin(row: AdminRow): Admin {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

export async function findAdminById(id: string): Promise<AdminRow | undefined> {
  const { rows } = await query<AdminRow>('SELECT * FROM admins WHERE id = $1', [id]);
  return rows[0];
}

export async function listAdmins(): Promise<{ items: Admin[]; total: number }> {
  const { rows } = await query<AdminRow>('SELECT * FROM admins ORDER BY created_at, email');
  return { items: rows.map(toAdmin), total: rows.length };
}

// Used to keep login timing similar for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('parklens-dummy-password', BCRYPT_ROUNDS);

/** Returns the admin on valid credentials (and records last_login_at), otherwise undefined. */
export async function verifyCredentials(email: string, password: string): Promise<AdminRow | undefined> {
  const { rows } = await query<AdminRow>('SELECT * FROM admins WHERE lower(email) = lower($1)', [email.trim()]);
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return undefined;
  const updated = await query<AdminRow>(
    'UPDATE admins SET last_login_at = now() WHERE id = $1 RETURNING *',
    [row.id],
  );
  return updated.rows[0] ?? row;
}

export async function createAdmin(input: { email: string; name: string; password: string }): Promise<Admin> {
  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  try {
    const { rows } = await query<AdminRow>(
      'INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [input.email.toLowerCase(), input.name, hash],
    );
    return toAdmin(rows[0]!);
  } catch (err) {
    if (isUniqueViolation(err, 'admins_email_key')) throw errors.emailTaken();
    throw err;
  }
}

export async function deleteAdmin(id: string, currentAdminId: string): Promise<void> {
  if (id === currentAdminId) throw errors.cannotDeleteSelf();
  await withTransaction(async (c) => {
    // lock all admin rows so two concurrent deletes cannot remove the last two admins
    const { rows } = await c.query<{ id: string }>('SELECT id FROM admins ORDER BY id FOR UPDATE');
    if (!rows.some((r) => r.id === id)) throw errors.notFound('Admin');
    if (rows.length <= 1) throw errors.lastAdmin();
    await c.query('DELETE FROM admins WHERE id = $1', [id]);
  });
}

export async function changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
  const admin = await findAdminById(adminId);
  if (!admin) throw errors.unauthorized();
  if (!(await bcrypt.compare(currentPassword, admin.password_hash))) {
    // 403 (not 401) so clients don't mistake it for an expired session
    throw errors.invalidCredentials(403, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query('UPDATE admins SET password_hash = $2 WHERE id = $1', [adminId, hash]);
}

/** Creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME if no admin exists yet. */
export async function ensureInitialAdmin(): Promise<void> {
  const hash = await bcrypt.hash(config.adminPassword, BCRYPT_ROUNDS);
  await withTransaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('parklens:ensure-admin'))");
    const { rows } = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM admins');
    if ((rows[0]?.n ?? 0) > 0) return;
    await c.query('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)', [
      config.adminEmail,
      config.adminName,
      hash,
    ]);
    log.info(`created initial admin ${config.adminEmail}`);
  });
}
