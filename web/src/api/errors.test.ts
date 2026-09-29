import { describe, expect, it } from 'vitest';
import { ApiError, errorFromResponse, errorKey, toApiError } from './errors';

describe('errorFromResponse', () => {
  it('reads the contract error shape', () => {
    const e = errorFromResponse(409, { error: { code: 'ALREADY_PERMITTED', message: 'dup' } });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('ALREADY_PERMITTED');
    expect(e.status).toBe(409);
    expect(e.message).toBe('dup');
  });

  it('keeps zod details for VALIDATION_ERROR', () => {
    const e = errorFromResponse(400, {
      error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ path: 'validDate', message: 'required' }] },
    });
    expect(e.validationDetails).toEqual([{ path: 'validDate', message: 'required' }]);
  });

  it('falls back to a code from the HTTP status for non-JSON bodies', () => {
    expect(errorFromResponse(502, '<html>Bad Gateway</html>').code).toBe('NETWORK');
    expect(errorFromResponse(500, null).code).toBe('INTERNAL');
    expect(errorFromResponse(429, null).code).toBe('RATE_LIMITED');
    expect(errorFromResponse(404, null).code).toBe('NOT_FOUND');
    expect(errorFromResponse(418, null).code).toBe('UNKNOWN');
  });
});

describe('toApiError / errorKey', () => {
  it('maps failed fetches to NETWORK', () => {
    expect(toApiError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('errors.NETWORK');
  });

  it('translates known codes and falls back to UNKNOWN', () => {
    expect(errorKey(new ApiError('INVALID_STATE', 'x', 422))).toBe('errors.INVALID_STATE');
    expect(errorKey(new ApiError('SOMETHING_NEW', 'x', 400))).toBe('errors.UNKNOWN');
    expect(errorKey(new Error('boom'))).toBe('errors.UNKNOWN');
  });
});
