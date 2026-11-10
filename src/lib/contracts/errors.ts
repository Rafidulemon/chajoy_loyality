/**
 * Error codes the API can return. The server throws them (src/server/errors.ts) and the apps map each one to a
 * bilingual message (src/lib/api/messages.ts). Keep this list in one place so both sides agree.
 */
export const ERROR_CODES = [
  // generic
  'BAD_REQUEST',
  'VALIDATION',
  'BAD_ORIGIN',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  // sign-in
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'OTP_INVALID',
  'OTP_TOO_MANY_ATTEMPTS',
  'OTP_RATE_LIMITED',
  // stamps
  'DAILY_LIMIT_REACHED',
  'EXCEEDS_CARD',
  'OVERRIDE_NOT_APPROVED',
  'UNDO_NOT_ALLOWED',
  'STAMPS_BELOW_ZERO',
  'IDEMPOTENCY_KEY_REUSED',
  // vouchers and member QR codes
  'QR_INVALID',
  'VOUCHER_NOT_FOUND',
  'VOUCHER_USED',
  'VOUCHER_EXPIRED',
  'ITEM_REQUIRED',
  'ITEM_NOT_ALLOWED',
  // offers
  'OFFER_NOT_FOUND',
  'OFFER_NOT_CLAIMABLE',
  'OFFER_ENDED',
  'ALREADY_CLAIMED',
  // customers and staff
  'PHONE_TAKEN',
  'PROFILE_INCOMPLETE',
  // program, SMS
  'VERSION_CONFLICT',
  'SMS_BALANCE_LOW',
  'NO_RECIPIENTS',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The JSON body of every error response. */
export type ApiErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};
