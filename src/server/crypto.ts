import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from 'node:crypto';
import { CODE_ALPHABET } from '@/lib/domain/codes';
import { isWeakPin } from '@/lib/domain/pin';
import { env } from './env';

const scryptAsync = (password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

export const sha256 = (data: string) => createHash('sha256').update(data).digest('hex');

/**
 * Keyed hash with a label, so a value hashed for one purpose can never be replayed for another
 * (an OTP hash is not a valid QR signature). The key is AUTH_SECRET.
 */
export function hmac(label: string, data: string): string {
  return createHmac('sha256', env().AUTH_SECRET).update(`${label}\0${data}`).digest('hex');
}

/** Compares two strings without leaking where they differ or how long they are. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** A random bearer token, 256 bits, URL safe. Only its SHA-256 is stored (see auth/session.ts). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** A random numeric code such as an OTP, zero padded. */
export const randomDigits = (n: number) => String(randomInt(0, 10 ** n)).padStart(n, '0');

/** A random 6-digit PIN that is not an obvious one (see isWeakPin). Used for a new staff account and for a PIN reset. */
export function generatePin(): string {
  for (;;) {
    const pin = randomDigits(6);
    if (!isWeakPin(pin)) return pin;
  }
}

/** "CJ-4F7K-92QH" from the unambiguous alphabet: 32^8 (about 10^12) possibilities, so a guess practically never hits. */
export function generateVoucherCode(): string {
  const pick = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `CJ-${pick(4)}-${pick(4)}`;
}

// ---------------------------------------------------------------------------------------------
// PINs
// ---------------------------------------------------------------------------------------------
// A PIN has only 10^6 possibilities, so no hash can protect it from an attacker who has the database: the real defence is
// the lockout after wrong tries (see auth/staff.ts). Still, the PIN is first run through HMAC with AUTH_SECRET (a pepper),
// so a leaked table alone cannot be brute forced, and then through scrypt with a per-PIN salt.

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 } as const;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(hmac('pin', pin), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend about the same time as a real check, so "no such PIN" is not visible in the response time.
    await scryptAsync(hmac('pin', pin), 'dummy-salt-dummy', SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM });
    return false;
  }
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(hmac('pin', pin), Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
