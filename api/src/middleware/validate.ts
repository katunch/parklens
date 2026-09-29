import type { ZodType } from 'zod';
import { errors } from '../lib/errors.js';
import { isUuid } from '../lib/ids.js';

/** Parse input with a zod schema; a ZodError is turned into 400 VALIDATION_ERROR by the error handler. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data ?? {});
}

/** Validate a UUID route param; malformed ids are simply "not found". */
export function uuidParam(value: string | string[] | undefined, what = 'Resource'): string {
  if (typeof value !== 'string' || !isUuid(value)) throw errors.notFound(what);
  return value;
}
