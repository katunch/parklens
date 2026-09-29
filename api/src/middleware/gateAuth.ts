import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { errors } from '../lib/errors.js';
import { authenticateToken, bearerToken } from './auth.js';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function isValidGateKey(key: string | undefined): boolean {
  if (!key) return false;
  return timingSafeEqual(digest(key), digest(config.gateApiKey));
}

/** Gate endpoints accept `X-API-Key: <GATE_API_KEY>` or an admin bearer token (UI simulator). */
export async function requireGateAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.get('x-api-key');
  if (apiKey !== undefined) {
    if (!isValidGateKey(apiKey)) throw errors.unauthorized('Invalid API key');
    return next();
  }
  const token = bearerToken(req);
  if (!token) throw errors.unauthorized('X-API-Key or bearer token required');
  req.admin = await authenticateToken(token);
  next();
}
