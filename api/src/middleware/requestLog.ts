import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { log } from '../lib/log.js';

/** One log line per request (health checks skipped, tokens redacted). */
export const requestLog: RequestHandler = (req, res, next) => {
  if (!config.logRequests || req.path === '/api/health') return next();
  const start = process.hrtime.bigint();
  res.on('close', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const url = req.originalUrl.replace(/([?&]token=)[^&]*/i, '$1***');
    log.info(`${req.method} ${url} ${res.statusCode} ${ms.toFixed(1)}ms ip=${req.ip ?? '-'}`);
  });
  next();
};
