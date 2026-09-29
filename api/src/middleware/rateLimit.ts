import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { errorBody } from './errorHandler.js';

/** Per-IP limiter (IP resolved via `trust proxy`) answering 429 RATE_LIMITED in the standard error shape. */
export function perIpLimiter(limit: number, windowMs = 60_000): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Too many requests, please try again in a minute'));
    },
  });
}
