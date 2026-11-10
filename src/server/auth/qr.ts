import 'server-only';
import { hmac, safeEqual } from '../crypto';
import { fail } from '../errors';

/**
 * The code in the customer's QR (NF-07). It used to be a fixed member id that a screenshot could copy for ever. Now it is a
 * signed token that is only good for 90 seconds, and the app asks for a fresh one every minute.
 *
 *   CJ1.<customer id>.<expires, base36 seconds>.<signature>
 *
 * The signature is an HMAC with AUTH_SECRET over the first two parts, so it cannot be forged or changed, and the cashier
 * app sends the token to the server, which checks it. A copied screenshot stops working after a minute and a half.
 */

export const QR_TTL_SEC = 90;
const SIG_LENGTH = 22; // 132 bits of the HMAC, plenty for a token that lives for 90 seconds

const sign = (customerId: string, exp: string) => Buffer.from(hmac('qr', `${customerId}.${exp}`), 'hex').toString('base64url').slice(0, SIG_LENGTH);

export function signMemberQr(customerId: string, now = new Date()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + QR_TTL_SEC * 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000).toString(36);
  return { token: `CJ1.${customerId}.${exp}.${sign(customerId, exp)}`, expiresAt };
}

/** Returns the customer id from a valid, unexpired token. Every failure looks the same to the caller. */
export function verifyMemberQr(token: string, now = new Date()): string {
  const bad = () => fail.unprocessable('QR_INVALID', 'This QR code is not valid or has expired. Ask the customer to refresh it');
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'CJ1') throw bad();
  const [, customerId, exp, signature] = parts;
  if (!safeEqual(signature, sign(customerId, exp))) throw bad();
  const expiresMs = parseInt(exp, 36) * 1000;
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) throw bad();
  return customerId;
}
