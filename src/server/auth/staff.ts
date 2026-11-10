import 'server-only';
import { db } from '../db';
import { fail } from '../errors';
import { hashPin, verifyPin } from '../crypto';
import { log, maskPhone } from '../log';
import { isWeakPin } from '@/lib/domain/pin';
import type { StaffRole } from '@/lib/domain/permissions';
import type { StaffActor } from '../domain/stamps';
import { consumeOtp, issueOtp } from './otp';
import { startStaffSession } from './session';

/**
 * Staff sign-in (CA-18, MG-21).
 *
 * - A cashier signs in with phone number and a 6-digit PIN, and works at the one outlet they belong to.
 * - A manager or owner signs in with phone number and PIN, then confirms a code sent by SMS (two steps).
 * - Five wrong PINs lock the account for 15 minutes. The answer to a wrong number and a wrong PIN is the same, and takes about as long.
 * - The same PIN check approves a manager override for a cashier at the counter (BR-02); wrong tries count the same way.
 */

const MAX_PIN_FAILURES = 5;
const LOCK_MINUTES = 15;

type StaffWithBranches = { id: string; role: StaffRole; active: boolean; branches: { branchId: string }[] };

export type StaffLoginResult = { status: 'ok'; staffId: string } | { status: 'otp_required'; challengeId: string; expiresInSec: number; resendAfterSec: number };

export async function loginWithPin(input: { phone: string; pin: string; branchId?: string; ipHash: string | null; userAgent: string | null; now?: Date }): Promise<StaffLoginResult> {
  const now = input.now ?? new Date();
  const staff = await db().staff.findUnique({ where: { phone: input.phone }, include: { branches: { select: { branchId: true } } } });

  if (!staff || !staff.active) {
    await verifyPin(input.pin, null); // same cost as a real check
    throw fail.unprocessable('INVALID_CREDENTIALS', 'Wrong phone number or PIN');
  }
  if (staff.lockedUntil && staff.lockedUntil > now) {
    throw fail.rateLimited('ACCOUNT_LOCKED', Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 1000), 'Too many wrong PINs. Try again later');
  }

  if (!(await verifyPin(input.pin, staff.pinHash))) {
    await recordPinFailure(staff.id, now);
    log.warn('staff.login_failed', { to: maskPhone(input.phone) });
    throw fail.unprocessable('INVALID_CREDENTIALS', 'Wrong phone number or PIN');
  }
  if (staff.failedPinAttempts > 0) await db().staff.update({ where: { id: staff.id }, data: { failedPinAttempts: 0 } });

  // Fail early on a bad outlet choice, before a code is sent.
  await resolveBranch(staff, input.branchId);

  if (staff.role === 'CASHIER') {
    await openStaffSession(staff, input.branchId, { ipHash: input.ipHash, userAgent: input.userAgent }, now);
    return { status: 'ok', staffId: staff.id };
  }
  const otp = await issueOtp({ purpose: 'STAFF_LOGIN', phone: staff.phone, staffId: staff.id, ipHash: input.ipHash, now });
  return { status: 'otp_required', ...otp };
}

/** The second step for managers and owners. */
export async function completeStaffLogin(input: { challengeId: string; code: string; branchId?: string; ipHash: string | null; userAgent: string | null; now?: Date }): Promise<{ staffId: string }> {
  const now = input.now ?? new Date();
  const { staffId } = await consumeOtp({ purpose: 'STAFF_LOGIN', challengeId: input.challengeId, code: input.code, now });
  const staff = staffId ? await db().staff.findUnique({ where: { id: staffId }, include: { branches: { select: { branchId: true } } } }) : null;
  if (!staff || !staff.active) throw fail.unprocessable('INVALID_CREDENTIALS', 'This account cannot sign in');
  await openStaffSession(staff, input.branchId, { ipHash: input.ipHash, userAgent: input.userAgent }, now);
  return { staffId: staff.id };
}

async function openStaffSession(staff: StaffWithBranches, requestedBranchId: string | undefined, meta: { ipHash: string | null; userAgent: string | null }, now: Date) {
  const branchId = await resolveBranch(staff, requestedBranchId);
  await startStaffSession(staff.id, branchId, meta, now);
}

/**
 * The outlet a session works at. A cashier is tied to their own. A manager picks among theirs. An owner may pick any
 * active outlet and defaults to the main one. Stamps and rewards are recorded against it, so it must be real.
 */
export async function resolveBranch(staff: StaffWithBranches, requested?: string): Promise<string | null> {
  const mine = staff.branches.map((b) => b.branchId);
  if (staff.role === 'OWNER') {
    if (requested) {
      const branch = await db().branch.findFirst({ where: { id: requested, active: true }, select: { id: true } });
      if (!branch) throw fail.forbidden('That outlet is not available');
      return branch.id;
    }
    const main = await db().branch.findFirst({ where: { active: true }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }], select: { id: true } });
    return main?.id ?? null;
  }
  if (requested && !mine.includes(requested)) throw fail.forbidden('You do not work at that outlet');
  const chosen = requested ?? mine[0] ?? null;
  if (!chosen && staff.role === 'CASHIER') throw fail.forbidden('No outlet is assigned to this account yet');
  return chosen;
}

async function recordPinFailure(staffId: string, now: Date) {
  const { failedPinAttempts } = await db().staff.update({ where: { id: staffId }, data: { failedPinAttempts: { increment: 1 } }, select: { failedPinAttempts: true } });
  if (failedPinAttempts >= MAX_PIN_FAILURES) {
    await db().staff.update({ where: { id: staffId }, data: { failedPinAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } });
  }
}

/**
 * A staff member changes their own PIN (the owner hands out a first PIN, which should not stay). Needs the current PIN, counted
 * like a sign-in (five wrong tries lock the account). Other signed-in devices are signed out, this one stays.
 */
export async function changeOwnPin(input: { staffId: string; sessionId: string; currentPin: string; newPin: string; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  if (isWeakPin(input.newPin)) throw fail.validation({ issues: [{ path: 'newPin', message: 'Choose a PIN that is harder to guess (not 123456 or 000000)' }] });
  const staff = await db().staff.findUniqueOrThrow({ where: { id: input.staffId }, select: { pinHash: true, lockedUntil: true } });
  if (staff.lockedUntil && staff.lockedUntil > now) {
    throw fail.rateLimited('ACCOUNT_LOCKED', Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 1000), 'Too many wrong PINs. Try again later');
  }
  if (!(await verifyPin(input.currentPin, staff.pinHash))) {
    await recordPinFailure(input.staffId, now);
    throw fail.unprocessable('INVALID_CREDENTIALS', 'The current PIN is not right');
  }
  await db().$transaction([
    db().staff.update({ where: { id: input.staffId }, data: { pinHash: await hashPin(input.newPin), pinChangedAt: now, failedPinAttempts: 0 } }),
    db().session.updateMany({ where: { staffId: input.staffId, revokedAt: null, id: { not: input.sessionId } }, data: { revokedAt: now } }),
  ]);
}

/**
 * BR-02: a manager's PIN lets a cashier go over the daily limit. The PIN belongs to an active manager of this outlet or to
 * an owner. Guessing is limited: five wrong PINs lock the cashier's account, like a wrong sign-in PIN.
 * Returns the approver so the ledger can record who allowed it.
 */
export async function approveOverride(input: { actor: StaffActor; pin: string; now?: Date }): Promise<{ approverId: string }> {
  const now = input.now ?? new Date();
  const actor = await db().staff.findUniqueOrThrow({ where: { id: input.actor.id }, select: { lockedUntil: true } });
  if (actor.lockedUntil && actor.lockedUntil > now) {
    throw fail.rateLimited('ACCOUNT_LOCKED', Math.ceil((actor.lockedUntil.getTime() - now.getTime()) / 1000), 'Too many wrong PINs. Try again later');
  }

  const candidates = await db().staff.findMany({
    where: {
      active: true,
      pinHash: { not: null },
      id: { not: input.actor.id },
      OR: [{ role: 'OWNER' }, ...(input.actor.branchId ? [{ role: 'MANAGER' as const, branches: { some: { branchId: input.actor.branchId } } }] : [])],
    },
    select: { id: true, pinHash: true, lockedUntil: true },
  });

  let approverId: string | null = null;
  for (const c of candidates) {
    const ok = await verifyPin(input.pin, c.pinHash);
    if (ok && !(c.lockedUntil && c.lockedUntil > now) && !approverId) approverId = c.id;
  }
  if (candidates.length === 0) await verifyPin(input.pin, null);

  if (!approverId) {
    await recordPinFailure(input.actor.id, now);
    log.warn('override.denied', { actor: input.actor.id });
    throw fail.unprocessable('OVERRIDE_NOT_APPROVED', 'That PIN is not a manager PIN');
  }
  return { approverId };
}
