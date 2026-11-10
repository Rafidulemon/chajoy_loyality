import 'server-only';
import type { ErrorCode } from '@/lib/contracts/errors';

/**
 * An error the caller should see: a stable code, an HTTP status and a short English message (the apps show their own
 * bilingual text for the code). Anything else that is thrown becomes a 500 with no detail, so internals never leak.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    /** Seconds the caller should wait, sent as Retry-After. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const fail = {
  badRequest: (message: string, details?: unknown) => new AppError('BAD_REQUEST', 400, message, details),
  validation: (details: unknown) => new AppError('VALIDATION', 400, 'The request is not valid', details),
  badOrigin: () => new AppError('BAD_ORIGIN', 403, 'Cross-site request refused'),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 401, 'Sign in first'),
  forbidden: (message = 'You are not allowed to do this') => new AppError('FORBIDDEN', 403, message),
  notFound: (what: string) => new AppError('NOT_FOUND', 404, `${what} was not found`),
  conflict: (code: ErrorCode, message: string, details?: unknown) => new AppError(code, 409, message, details),
  unprocessable: (code: ErrorCode, message: string, details?: unknown) => new AppError(code, 422, message, details),
  rateLimited: (code: Extract<ErrorCode, 'RATE_LIMITED' | 'OTP_RATE_LIMITED' | 'ACCOUNT_LOCKED' | 'OTP_TOO_MANY_ATTEMPTS'>, retryAfter: number, message = 'Too many attempts. Try again later') =>
    new AppError(code, 429, message, undefined, retryAfter),
};

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
