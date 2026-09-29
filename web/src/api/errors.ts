/** Normalised API error: `{code, message, status}` (+ zod `details` for VALIDATION_ERROR). */

export interface ValidationDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** zod issues from a VALIDATION_ERROR, if any. */
  get validationDetails(): ValidationDetail[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (d): d is ValidationDetail =>
        typeof d === 'object' && d !== null && typeof (d as ValidationDetail).path === 'string',
    );
  }
}

/** Codes with a translation under `errors.*` (backend codes + client-side NETWORK / UNKNOWN). */
export const KNOWN_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_PLATE',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'NOT_FOUND',
  'DUPLICATE_REQUEST',
  'ALREADY_PERMITTED',
  'INVALID_STATE',
  'DATE_IN_PAST',
  'DATE_TOO_FAR',
  'CANNOT_DELETE_SELF',
  'LAST_ADMIN',
  'EMAIL_TAKEN',
  'RATE_LIMITED',
  'INTERNAL',
  'NETWORK',
  'UNKNOWN',
] as const;

function codeForStatus(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  // A gateway error from nginx means the API is unreachable.
  if (status === 502 || status === 503 || status === 504) return 'NETWORK';
  if (status >= 500) return 'INTERNAL';
  return 'UNKNOWN';
}

/** Build an ApiError from an HTTP status and a (possibly non-JSON) response body. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const err = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
  if (err && typeof err.code === 'string') {
    return new ApiError(err.code, typeof err.message === 'string' ? err.message : err.code, status, err.details);
  }
  const code = codeForStatus(status);
  return new ApiError(code, `HTTP ${status}`, status);
}

/** Anything thrown → ApiError (fetch TypeErrors become NETWORK). */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof TypeError) return new ApiError('NETWORK', e.message, 0);
  if (e instanceof DOMException && e.name === 'AbortError') return new ApiError('NETWORK', 'Aborted', 0);
  return new ApiError('UNKNOWN', e instanceof Error ? e.message : String(e), 0);
}

/** i18n key for an error: `errors.<CODE>` when known, else `errors.UNKNOWN`. */
export function errorKey(e: unknown): string {
  const code = toApiError(e).code;
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code) ? `errors.${code}` : 'errors.UNKNOWN';
}

export function errorCode(e: unknown): string {
  return toApiError(e).code;
}
