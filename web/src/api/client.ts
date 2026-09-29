import { ApiError, errorFromResponse } from './errors';

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  body?: unknown;
  query?: object;
  /** Send the admin bearer token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

let tokenGetter: () => string | null = () => null;
let unauthorizedHandler: () => void = () => {};

/** Wire the client to the auth state (called once by the AuthProvider). */
export function configureClient(opts: { getToken: () => string | null; onUnauthorized: () => void }): void {
  tokenGetter = opts.getToken;
  unauthorizedHandler = opts.onUnauthorized;
}

export function buildQuery(query?: object): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, QueryValue>)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Typed fetch against `/api`. Throws ApiError (NETWORK for failed fetches). */
export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, query, auth = true, signal } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? tokenGetter() : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError('NETWORK', e instanceof Error ? e.message : 'Network error', 0);
  }

  if (res.status === 204) return undefined as T;
  const data = await readBody(res);
  if (!res.ok) {
    const err = errorFromResponse(res.status, data);
    // A 401 on an authenticated call means the session is gone. INVALID_CREDENTIALS is a
    // field error (login / change password), never a logout.
    if (res.status === 401 && auth && token && err.code !== 'INVALID_CREDENTIALS') unauthorizedHandler();
    throw err;
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body: body ?? {} }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};
