import 'server-only';
import { db } from '../db';
import { env } from '../env';
import { AppError, fail } from '../errors';
import { hmac, randomDigits, safeEqual } from '../crypto';
import { log, maskPhone } from '../log';
import { smsProvider } from '../sms';
import type { OtpPurpose } from '@/generated/prisma/enums';

/**
 * One-time codes for sign-in (BR-16, CU-01) and for the second step of management sign-in (MG-21).
 *
 * - A code is 6 digits, valid for 5 minutes, usable once and wrong at most 5 times; only a keyed hash is stored.
 * - A phone gets one code every 30 seconds and at most 5 an hour; one network address at most 20 an hour (NF-06).
 * - In OTP_MODE=fixed (development only, refused in production) nothing is sent and everyone uses DEV_OTP_CODE.
 */

export const OTP_TTL_SEC = 300;
export const OTP_RESEND_SEC = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PER_PHONE_PER_HOUR = 5;
const OTP_PER_IP_PER_HOUR = 20;
const HOUR = 3_600_000;

export type IssuedOtp = { challengeId: string; expiresInSec: number; resendAfterSec: number };

export async function issueOtp(input: { purpose: OtpPurpose; phone: string; staffId?: string; ipHash: string | null; now?: Date }): Promise<IssuedOtp> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - HOUR);

  const [latest, byPhone, byIp] = await Promise.all([
    db().otpChallenge.findFirst({ where: { phone: input.phone, purpose: input.purpose }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    db().otpChallenge.count({ where: { phone: input.phone, purpose: input.purpose, createdAt: { gte: since } } }),
    input.ipHash ? db().otpChallenge.count({ where: { ipHash: input.ipHash, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);

  if (latest) {
    const waitMs = OTP_RESEND_SEC * 1000 - (now.getTime() - latest.createdAt.getTime());
    if (waitMs > 0) throw fail.rateLimited('OTP_RATE_LIMITED', Math.ceil(waitMs / 1000), 'Wait a moment before asking for another code');
  }
  if (byPhone >= OTP_PER_PHONE_PER_HOUR || byIp >= OTP_PER_IP_PER_HOUR) {
    throw fail.rateLimited('OTP_RATE_LIMITED', 900, 'Too many codes requested. Try again in a while');
  }

  const fixed = env().OTP_MODE === 'fixed';
  const code = fixed ? null : randomDigits(6);
  const challenge = await db().otpChallenge.create({
    data: {
      purpose: input.purpose,
      phone: input.phone,
      staffId: input.staffId,
      codeHash: 'pending',
      expiresAt: new Date(now.getTime() + OTP_TTL_SEC * 1000),
      ipHash: input.ipHash,
      createdAt: now,
    },
    select: { id: true },
  });
  // The hash is bound to the challenge id, so a code cannot be replayed against another challenge.
  await db().otpChallenge.update({ where: { id: challenge.id }, data: { codeHash: hmac('otp', `${challenge.id}:${code ?? 'fixed'}`) } });

  if (code) {
    try {
      await smsProvider().send(input.phone, `ChaJoy: your code is ${code}. It works for 5 minutes. Do not share it.`);
    } catch (e) {
      // Do not leave a usable challenge behind for a code that never arrived.
      await db().otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      log.error('otp.send_failed', { to: maskPhone(input.phone), err: e instanceof Error ? e.message : String(e) });
      throw new AppError('INTERNAL', 502, 'The code could not be sent. Try again');
    }
  }
  log.info('otp.issued', { to: maskPhone(input.phone), purpose: input.purpose, mode: fixed ? 'fixed' : 'sms' });
  return { challengeId: challenge.id, expiresInSec: OTP_TTL_SEC, resendAfterSec: OTP_RESEND_SEC };
}

/**
 * Checks a code and, when it is right, uses the challenge up. Every wrong guess is counted before it is compared, in one
 * atomic update, so parallel guesses cannot get past the limit. The error does not say whether the challenge existed.
 */
export async function consumeOtp(input: { purpose: OtpPurpose; challengeId: string; code: string; now?: Date }): Promise<{ phone: string; staffId: string | null }> {
  const now = input.now ?? new Date();
  const row = await db().otpChallenge.findUnique({ where: { id: input.challengeId } });
  if (!row || row.purpose !== input.purpose || row.consumedAt || row.expiresAt <= now) {
    throw fail.unprocessable('OTP_INVALID', 'That code is not valid. Ask for a new one');
  }

  const counted = await db().otpChallenge.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) {
    await db().otpChallenge.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
    throw fail.rateLimited('OTP_TOO_MANY_ATTEMPTS', OTP_TTL_SEC, 'Too many wrong codes. Ask for a new one');
  }

  // Fixed mode (development only): everyone's code is DEV_OTP_CODE. Otherwise compare against the stored keyed hash.
  const right =
    env().OTP_MODE === 'fixed' ? safeEqual(input.code, env().DEV_OTP_CODE ?? '') : safeEqual(row.codeHash, hmac('otp', `${row.id}:${input.code}`));
  if (!right) throw fail.unprocessable('OTP_INVALID', 'That code is not right');

  const used = await db().otpChallenge.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (used.count === 0) throw fail.unprocessable('OTP_INVALID', 'That code was already used');
  return { phone: row.phone, staffId: row.staffId };
}
