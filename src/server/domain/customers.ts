import 'server-only';
import { fail } from '../errors';
import { isUniqueViolation, type Tx } from '../db';
import { normalizePhone, phoneSearchDigits } from '@/lib/domain/phone';
import { dhakaDateColumn } from '@/lib/domain/time';
import type { StaffRole } from '@/lib/domain/permissions';
import type { Customer } from '@/generated/prisma/client';
import type { JoinChannel, Language } from '@/generated/prisma/enums';
import type { CustomerRowDto } from '@/lib/contracts/dto';
import { toCustomerRowDto, type CustomerWithCard } from './dto';
import { getProgramLocked } from './program';
import { touchVisit, writeStamps } from './ledger';
import { writeAudit, type RequestContext } from './audit';

export type NewCustomer = {
  /** E.164, already normalised. */
  phone: string;
  name?: string | null;
  joinedVia: JoinChannel;
  smsConsent?: boolean;
  language?: Language;
  birthday?: Date | null;
  /** The staff member adding them at the counter or from management. */
  createdById?: string | null;
  /** The outlet, for a customer added at the counter. */
  branchId?: string | null;
  at?: Date;
};

/**
 * Creates a customer with their card (BR-16: one number, one account), the welcome stamp when the program gives one
 * (BR-17, the same in the app, at the counter and from management) and the welcome notification.
 */
export async function createCustomer(tx: Tx, input: NewCustomer) {
  const at = input.at ?? new Date();
  // Shared lock on the program first, like every transaction that changes stamps (see getProgramLocked).
  const program = await getProgramLocked(tx);
  if (await tx.customer.findUnique({ where: { phone: input.phone }, select: { id: true } })) {
    throw fail.conflict('PHONE_TAKEN', 'This number already has a card');
  }

  let created: CustomerWithCard;
  try {
    created = await tx.customer.create({
      data: {
        phone: input.phone,
        name: input.name ?? null,
        joinedVia: input.joinedVia,
        smsConsent: input.smsConsent ?? false,
        language: input.language ?? 'EN',
        birthday: input.birthday ?? null,
        createdById: input.createdById ?? null,
        joinedBranchId: input.joinedVia === 'COUNTER' ? (input.branchId ?? null) : null,
        joinedAt: at,
        profileCompletedAt: input.name ? at : null,
        card: { create: { createdAt: at } },
      },
      include: { card: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail.conflict('PHONE_TAKEN', 'This number already has a card');
    throw e;
  }

  const atCounter = input.joinedVia === 'COUNTER' && !!input.branchId;
  let card = created.card!;
  let welcomeGiven = false;
  if (program.welcomeBonus) {
    const welcome = await writeStamps(tx, {
      customerId: created.id,
      card,
      program,
      delta: 1,
      source: 'WELCOME',
      at,
      staffId: input.createdById ?? null,
      branchId: atCounter ? input.branchId : null,
      visit: atCounter,
    });
    card = welcome.card;
    welcomeGiven = true;
  } else if (atCounter) {
    card = await touchVisit(tx, card, created.id, input.branchId!, at);
  }
  await tx.notification.create({ data: { customerId: created.id, kind: 'WELCOME', params: {}, createdAt: at } });
  return { customer: created as Customer, card, welcomeGiven };
}

/** Which of these customers have a voucher waiting, then the row DTOs. One query for the whole page, not one per customer. */
export async function toRows(tx: Tx, customers: CustomerWithCard[], role: StaffRole, now: Date): Promise<CustomerRowDto[]> {
  if (!customers.length) return [];
  const ready = await tx.voucher.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customers.map((c) => c.id) }, redeemedAt: null, expiresAt: { gt: now } },
    _count: { _all: true },
  });
  const readySet = new Set(ready.map((r) => r.customerId));
  return customers.map((c) => toCustomerRowDto(c, { hasReadyVoucher: readySet.has(c.id), role, now }));
}

/**
 * Finds customers at the counter (CA-02): a full number matches exactly, the last digits match the end of a number,
 * and anything else is searched in the name. At least 4 digits, so nobody can browse numbers by typing one digit.
 */
export async function searchCustomers(tx: Tx, input: { q: string; limit: number; role: StaffRole; now: Date }): Promise<CustomerRowDto[]> {
  const q = input.q.trim();
  const numeric = /^[\d\s+\-০-৯]+$/.test(q);
  const digits = phoneSearchDigits(q);
  let where;
  if (numeric) {
    if (!digits) return [];
    const full = normalizePhone(q);
    where = full ? { phone: full } : { phone: { endsWith: digits } };
  } else {
    where = { name: { contains: q, mode: 'insensitive' as const } };
  }
  const rows = await tx.customer.findMany({
    where: { ...where, deletedAt: null },
    include: { card: true },
    orderBy: { joinedAt: 'desc' },
    take: input.limit,
  });
  return toRows(tx, rows, input.role, input.now);
}

/** Customers who got a stamp or a reward at this outlet today (Dhaka time), newest first: the cashier's list (CA-14). */
export async function todaysCustomers(tx: Tx, input: { branchId: string; role: StaffRole; now: Date; limit?: number }): Promise<CustomerRowDto[]> {
  const visits = await tx.visit.findMany({
    where: { branchId: input.branchId, day: dhakaDateColumn(input.now), customer: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 50,
    include: { customer: { include: { card: true } } },
  });
  return toRows(tx, visits.map((v) => v.customer), input.role, input.now);
}

export async function getCustomerRow(tx: Tx, id: string, role: StaffRole, now: Date): Promise<CustomerRowDto> {
  const row = await tx.customer.findFirst({ where: { id, deletedAt: null }, include: { card: true } });
  if (!row) throw fail.notFound('Customer');
  return (await toRows(tx, [row], role, now))[0];
}

/**
 * BR-25, NF-08: a customer asks for their data to be deleted. Name, number, birthday, note and notifications are wiped and the
 * account is closed and signed out everywhere. The stamp ledger and vouchers stay: they hold no personal data, and the reports and
 * the audit trail still have to add up. The number is freed, so the same person can join again later as a new customer.
 */
export async function eraseCustomer(tx: Tx, customerId: string, ctx: RequestContext, at = new Date()) {
  const found = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
  if (!found) throw fail.notFound('Customer');
  await tx.customer.update({
    where: { id: customerId },
    data: { deletedAt: at, name: null, phone: `deleted:${customerId}`, birthday: null, internalNote: null, smsConsent: false, profileCompletedAt: null },
  });
  await tx.notification.deleteMany({ where: { customerId } });
  await tx.session.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: at } });
  await writeAudit(tx, ctx, { action: 'customer.erase', entityType: 'Customer', entityId: customerId, at });
}

export type ProfilePatch = { name?: string; birthday?: string | null; smsConsent?: boolean; language?: 'bn' | 'en' };

/** The setup screen and the profile page (CU-02). Giving a name completes the profile. */
export async function updateProfile(tx: Tx, customerId: string, patch: ProfilePatch, at = new Date()): Promise<Customer> {
  const current = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { profileCompletedAt: true, name: true } });
  return tx.customer.update({
    where: { id: customerId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.birthday !== undefined ? { birthday: patch.birthday ? new Date(`${patch.birthday}T00:00:00.000Z`) : null } : {}),
      ...(patch.smsConsent !== undefined ? { smsConsent: patch.smsConsent } : {}),
      ...(patch.language !== undefined ? { language: patch.language === 'bn' ? 'BN' : 'EN' } : {}),
      ...(!current.profileCompletedAt && (patch.name ?? current.name) ? { profileCompletedAt: at } : {}),
    },
  });
}
