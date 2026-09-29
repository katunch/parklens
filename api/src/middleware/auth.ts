import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { errors } from '../lib/errors.js';
import { isUuid } from '../lib/ids.js';
import { findAdminById, type AdminRow } from '../services/admins.js';

const TOKEN_TTL = '12h';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminRow;
    }
  }
}

export function signToken(adminId: string): string {
  return jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', expiresIn: TOKEN_TTL, subject: adminId });
}

/** Verify a JWT and load the admin it belongs to; throws 401 UNAUTHORIZED. */
export async function authenticateToken(token: string | undefined): Promise<AdminRow> {
  if (!token) throw errors.unauthorized();
  let sub: unknown;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    sub = typeof payload === 'object' ? payload.sub : undefined;
  } catch {
    throw errors.unauthorized('Invalid or expired token');
  }
  if (typeof sub !== 'string' || !isUuid(sub)) throw errors.unauthorized('Invalid token');
  const admin = await findAdminById(sub);
  if (!admin) throw errors.unauthorized('Account no longer exists');
  return admin;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1];
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.admin = await authenticateToken(bearerToken(req));
  next();
}

/** The authenticated admin (only valid behind requireAdmin). */
export function currentAdmin(req: Request): AdminRow {
  if (!req.admin) throw errors.unauthorized();
  return req.admin;
}
