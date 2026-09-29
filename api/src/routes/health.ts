import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';

export function healthRouter(): Router {
  const r = Router();
  r.get('/health', async (_req, res) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      await query('SELECT 1');
    } catch {
      db = 'error';
    }
    res
      .status(db === 'ok' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status: db === 'ok' ? 'ok' : 'error', db, time: new Date().toISOString(), timezone: config.timezone });
  });
  return r;
}
