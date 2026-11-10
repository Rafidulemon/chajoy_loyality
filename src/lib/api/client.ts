import type { ApiErrorBody, ErrorCode } from '@/lib/contracts/errors';

/**
 * The one way the apps talk to the server. It sends and receives JSON with the session cookie, and turns every failure
 * into an ApiError carrying the server's error code, so screens can react to the code ("daily limit reached") instead of
 * parsing text. Network failures become ApiError with code 'NETWORK'.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
    /** Seconds to wait before trying again, from Retry-After. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

let onSignedOut: (() => void) | undefined;

/** Registers what happens when any request is answered 401 (the session ended): the app sends the person to sign in. Set once by ApiProvider. */
export function setSignedOutHandler(handler: (() => void) | undefined) {
  onSignedOut = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No connection');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null;
  if (!res.ok) {
    // A 401 from anything but the sign-in calls themselves (a wrong code is also refused, but is not a session that ended) means the session is over.
    if (res.status === 401 && !path.startsWith('/api/auth/')) onSignedOut?.();
    const retry = Number(res.headers.get('retry-after')) || undefined;
    throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? 'Something went wrong', json?.error?.details, json?.requestId, retry);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};

/** The fetcher SWR uses: the key is the URL. */
export const fetcher = <T>(path: string) => api.get<T>(path);

/** Builds "/api/x?a=1&b=2" and leaves out empty values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
