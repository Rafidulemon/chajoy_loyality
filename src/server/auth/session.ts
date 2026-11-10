import 'server-only';
import { cookies } from 'next/headers';
import { db } from '../db';
import { randomToken, sha256 } from '../crypto';
import type { StaffRole } from '@/lib/domain/permissions';

/**
 * Sessions. After sign-in the browser holds a random 256-bit token in an httpOnly cookie; the database holds only its
 * SHA-256, so a leaked table cannot be replayed, and a session can be ended from the server (sign out everywhere, MG-21).
 *
 * Customers and staff use separate cookies. One phone can be both (a cashier who is also a member) without the two
 * identities ever mixing: the customer API only reads the customer cookie, the staff API only the staff cookie.
 *
 * - Customer: stays signed in for 90 days ("You'll stay logged in on this phone").
 * - Staff: 12 hours, and also ends after 30 minutes without a request (CA-18, lock on inactivity).
 */

const CUSTOMER_DAYS = 90;
const STAFF_HOURS = 12;
export const STAFF_IDLE_MINUTES = 30;
/** `lastSeenAt` is refreshed at most this often, so a busy screen does not write on every request. */
const TOUCH_MS = 60_000;

export type SessionKind = 'customer' | 'staff';

export type CustomerSession = { sessionId: string; customerId: string };
export type StaffSession = {
  sessionId: string;
  staff: { id: string; name: string; phone: string; role: StaffRole };
  /** The outlet this session records stamps against. Null for a manager or owner who has not picked one. */
  branchId: string | null;
  /** Outlets this person may work at. Empty for an owner, who may use any. */
  allowedBranchIds: string[];
};

const production = () => process.env.NODE_ENV === 'production';

/** `__Host-` pins the cookie to this exact host over HTTPS (no Domain, Path=/, Secure). Not usable on plain http://localhost, so development uses plain names. */
export const cookieName = (kind: SessionKind) => `${production() ? '__Host-' : ''}${kind === 'customer' ? 'cj_c' : 'cj_s'}`;

type Meta = { ipHash: string | null; userAgent: string | null };

async function setCookie(kind: SessionKind, token: string, maxAgeSec: number) {
  (await cookies()).set(cookieName(kind), token, { httpOnly: true, secure: production(), sameSite: 'lax', path: '/', maxAge: maxAgeSec });
}

export async function startCustomerSession(customerId: string, meta: Meta, now = new Date()) {
  const token = randomToken();
  const maxAge = CUSTOMER_DAYS * 86_400;
  await db().session.create({
    data: { tokenHash: sha256(token), customerId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + maxAge * 1000), ipHash: meta.ipHash, userAgent: meta.userAgent?.slice(0, 300) },
  });
  await setCookie('customer', token, maxAge);
}

export async function startStaffSession(staffId: string, branchId: string | null, meta: Meta, now = new Date()) {
  const token = randomToken();
  const maxAge = STAFF_HOURS * 3600;
  await db().session.create({
    data: {
      tokenHash: sha256(token),
      staffId,
      branchId,
      idleMinutes: STAFF_IDLE_MINUTES,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + maxAge * 1000),
      ipHash: meta.ipHash,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  await db().staff.update({ where: { id: staffId }, data: { lastLoginAt: now, lastSeenAt: now } });
  await setCookie('staff', token, maxAge);
}

async function tokenFromCookie(kind: SessionKind): Promise<string | null> {
  const value = (await cookies()).get(cookieName(kind))?.value;
  return value && value.length >= 20 && value.length <= 200 ? value : null;
}

export async function readCustomerSession(now = new Date()): Promise<CustomerSession | null> {
  const token = await tokenFromCookie('customer');
  if (!token) return null;
  const row = await db().session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, customerId: true, revokedAt: true, expiresAt: true, lastSeenAt: true, customer: { select: { deletedAt: true } } },
  });
  if (!row || !row.customerId || row.revokedAt || row.expiresAt <= now || row.customer?.deletedAt) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db().session.updateMany({ where: { id: row.id }, data: { lastSeenAt: now } });
  }
  return { sessionId: row.id, customerId: row.customerId };
}

export async function readStaffSession(now = new Date()): Promise<StaffSession | null> {
  const token = await tokenFromCookie('staff');
  if (!token) return null;
  const row = await db().session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      branchId: true,
      revokedAt: true,
      expiresAt: true,
      lastSeenAt: true,
      idleMinutes: true,
      staff: { select: { id: true, name: true, phone: true, role: true, active: true, branches: { select: { branchId: true } } } },
    },
  });
  if (!row || !row.staff || row.revokedAt || row.expiresAt <= now || !row.staff.active) return null;
  if (row.idleMinutes && now.getTime() - row.lastSeenAt.getTime() > row.idleMinutes * 60_000) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db().session.updateMany({ where: { id: row.id }, data: { lastSeenAt: now } });
    await db().staff.update({ where: { id: row.staff.id }, data: { lastSeenAt: now } });
  }
  return {
    sessionId: row.id,
    staff: { id: row.staff.id, name: row.staff.name, phone: row.staff.phone, role: row.staff.role },
    branchId: row.branchId,
    allowedBranchIds: row.staff.branches.map((b) => b.branchId),
  };
}

/** Ends the current session of one kind and clears its cookie. Safe to call when nobody is signed in. */
export async function endSession(kind: SessionKind, now = new Date()) {
  const token = await tokenFromCookie(kind);
  if (token) await db().session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: now } });
  (await cookies()).set(cookieName(kind), '', { httpOnly: true, secure: production(), sameSite: 'lax', path: '/', maxAge: 0 });
}

/** Signs a person out of every device (MG-21). */
export async function revokeAllSessions(who: { customerId: string } | { staffId: string }, now = new Date()) {
  await db().session.updateMany({ where: { ...who, revokedAt: null }, data: { revokedAt: now } });
}
