import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { log } from '../lib/log.js';

export function errorBody(code: string, message: string, details?: unknown) {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    log.error(`error after headers sent on ${req.method} ${req.path}`, err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid request';
    res.status(400).json(errorBody('VALIDATION_ERROR', message, details));
    return;
  }

  // body-parser errors (malformed JSON, payload too large, ...)
  const e = err as { type?: string; status?: number; statusCode?: number; message?: string };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('VALIDATION_ERROR', 'Malformed JSON body'));
    return;
  }
  const status = e?.status ?? e?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(400).json(errorBody('VALIDATION_ERROR', e.message ?? 'Bad request'));
    return;
  }

  log.error(`unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json(errorBody('INTERNAL', 'Internal server error'));
};
