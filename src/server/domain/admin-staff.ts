import 'server-only';
import { db, isUniqueViolation, type Tx } from '../db';
import { fail } from '../errors';
import { generatePin, hashPin } from '../crypto';
import { revokeAllSessions } from '../auth/session';
import { dhakaDayEnd, dhakaDayStart } from '@/lib/domain/time';
import type { Branch, Staff } from '@/generated/prisma/client';
import type { StaffRole } from '@/generated/prisma/enums';
import type { StaffRowDto, StaffSecretDto } from '@/lib/contracts/admin';
import type { StaffCreate, StaffUpdate } from '@/lib/contracts/schemas';
import { writeAudit, type RequestContext } from './audit';

type StaffWithBranches = Staff & { branches: { branch: Branch }[] };

function toRow(s: StaffWithBranches, stampsToday: number): StaffRowDto {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    role: s.role.toLowerCase() as StaffRowDto['role'],
    active: s.active,
    branches: s.branches.map((b) => ({ id: b.branch.id, name: { bn: b.branch.nameBn, en: b.branch.nameEn } })),
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    stampsToday: s.role === 'OWNER' ? null : stampsToday,
  };
}

const include = { branches: { include: { branch: true } } } as const;

/** The stamps counted as "given today" on the staff screen: added at the counter for a purchase, on this Dhaka day. */
const givenTodayWhere = (now: Date) => ({ source: 'PURCHASE' as const, count: { gt: 0 }, createdAt: { gte: dhakaDayStart(now), lt: dhakaDayEnd(now) } });

async function stampsGivenToday(tx: Tx, staffId: string, now: Date): Promise<number> {
  const sum = await tx.stampEntry.aggregate({ _sum: { count: true }, where: { staffId, ...givenTodayWhere(now) } });
  return sum._sum.count ?? 0;
}

/** MG-17: everyone with an account, with the outlets they work at and the stamps they gave today. */
export async function listStaff(tx: Tx, now: Date): Promise<StaffRowDto[]> {
  const [staff, today] = await Promise.all([
    tx.staff.findMany({ include, orderBy: [{ role: 'desc' }, { createdAt: 'asc' }] }),
    tx.stampEntry.groupBy({ by: ['staffId'], where: givenTodayWhere(now), _sum: { count: true } }),
  ]);
  const given = new Map(today.map((t) => [t.staffId, t._sum.count ?? 0]));
  // Owner first, then managers, then cashiers (the enum order is CASHIER, MANAGER, OWNER, so sort descending by it).
  return staff.map((s) => toRow(s, given.get(s.id) ?? 0));
}

async function checkBranches(role: 'cashier' | 'manager', branchIds: string[]) {
  const unique = [...new Set(branchIds)];
  if (role === 'cashier' && unique.length !== 1) throw fail.validation({ issues: [{ path: 'branchIds', message: 'A cashier works at exactly one outlet' }] });
  const found = await db().branch.count({ where: { id: { in: unique }, active: true } });
  if (found !== unique.length) throw fail.validation({ issues: [{ path: 'branchIds', message: 'One of those outlets does not exist or is closed' }] });
  return unique;
}

/**
 * MG-17: add a cashier or manager. The system makes a first PIN and shows it once to the owner, to hand over. It is stored
 * only as a salted hash, so nobody can read it back later. Owner accounts are not made here (see the README for how the first one is created).
 */
export async function createStaff(input: { data: StaffCreate; ctx: RequestContext }): Promise<StaffSecretDto> {
  const { data, ctx } = input;
  const branchIds = await checkBranches(data.role, data.branchIds);
  const pin = generatePin();
  const pinHash = await hashPin(pin);
  try {
    return await db().$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          phone: data.phone,
          name: data.name,
          role: data.role.toUpperCase() as StaffRole,
          pinHash,
          pinChangedAt: null,
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
        include,
      });
      await writeAudit(tx, ctx, { action: 'staff.create', entityType: 'Staff', entityId: created.id, after: { name: created.name, role: data.role, branchIds } });
      return { staff: toRow(created, 0), temporaryPin: pin };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail.conflict('PHONE_TAKEN', 'A staff member with this number already exists');
    throw e;
  }
}

/**
 * Change a staff member's name, role, outlets or switch the account on or off. Owners are not edited here and nobody can lock
 * themselves out. Any change to role, outlets or active status signs the person out, so the new scope applies at once.
 */
export async function updateStaff(input: { id: string; data: StaffUpdate; ctx: RequestContext; actingStaffId: string; now?: Date }): Promise<StaffRowDto> {
  const { id, data, ctx } = input;
  const target = await db().staff.findUnique({ where: { id }, include });
  if (!target) throw fail.notFound('Staff member');
  if (target.role === 'OWNER') throw fail.forbidden('Owner accounts are not changed here');
  if (id === input.actingStaffId && (data.active === false || data.role !== undefined)) throw fail.forbidden('You cannot change your own role or switch yourself off');

  const role = data.role ?? (target.role === 'MANAGER' ? 'manager' : 'cashier');
  const branchIds = data.branchIds ?? target.branches.map((b) => b.branchId);
  const checked = data.branchIds !== undefined || data.role !== undefined ? await checkBranches(role, branchIds) : undefined;
  const scopeChanged = data.role !== undefined || data.branchIds !== undefined || data.active === false;

  const updated = await db().$transaction(async (tx) => {
    await tx.staff.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role.toUpperCase() as StaffRole } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(checked ? { branches: { deleteMany: {}, create: checked.map((branchId) => ({ branchId })) } } : {}),
      },
    });
    const after = await tx.staff.findUniqueOrThrow({ where: { id }, include });
    await writeAudit(tx, ctx, {
      action: data.active === false ? 'staff.deactivate' : data.active === true ? 'staff.activate' : 'staff.update',
      entityType: 'Staff',
      entityId: id,
      before: { name: target.name, role: target.role, active: target.active, branchIds: target.branches.map((b) => b.branchId) },
      after: { name: after.name, role: after.role, active: after.active, branchIds: after.branches.map((b) => b.branchId) },
    });
    return after;
  });
  if (scopeChanged) await revokeAllSessions({ staffId: id });
  return toRow(updated, await stampsGivenToday(db(), id, input.now ?? new Date()));
}

/**
 * The first owner, or a new PIN for an owner who has forgotten theirs. Used by the setup script (scripts/create-owner.ts) and by
 * nothing else: the owner is the root of every other account, so no screen or request can make one. Returns the PIN once;
 * only its salted hash is stored. Never touches a cashier or a manager.
 */
export async function ensureOwner(input: { phone: string; name?: string; resetPin?: boolean }): Promise<{ created: boolean; name: string; pin: string }> {
  const ctx: RequestContext = { actor: { type: 'SYSTEM', id: null } };
  const existing = await db().staff.findUnique({ where: { phone: input.phone }, select: { id: true, role: true, name: true } });
  const pin = generatePin();
  const pinHash = await hashPin(pin);

  if (existing) {
    if (existing.role !== 'OWNER') throw fail.forbidden('That number belongs to a cashier or manager. Only owner accounts are managed here');
    if (!input.resetPin) throw fail.conflict('PHONE_TAKEN', 'That number is already an owner');
    await db().$transaction(async (tx) => {
      await tx.staff.update({ where: { id: existing.id }, data: { pinHash, pinChangedAt: null, failedPinAttempts: 0, lockedUntil: null, active: true } });
      await writeAudit(tx, ctx, { action: 'staff.reset_pin', entityType: 'Staff', entityId: existing.id });
    });
    await revokeAllSessions({ staffId: existing.id });
    return { created: false, name: existing.name, pin };
  }

  const name = (input.name ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) throw fail.validation({ issues: [{ path: 'name', message: 'Give the owner’s name, 2 to 80 characters' }] });
  try {
    await db().$transaction(async (tx) => {
      const created = await tx.staff.create({ data: { phone: input.phone, name, role: 'OWNER', pinHash, pinChangedAt: null } });
      await writeAudit(tx, ctx, { action: 'staff.create', entityType: 'Staff', entityId: created.id, after: { name, role: 'owner', branchIds: [] } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail.conflict('PHONE_TAKEN', 'A staff member with this number already exists');
    throw e;
  }
  return { created: true, name, pin };
}

/** A forgotten PIN: make a new one, show it once, clear a lockout and sign the person out everywhere. */
export async function resetStaffPin(input: { id: string; ctx: RequestContext; actingStaffId: string; now?: Date }): Promise<StaffSecretDto> {
  const target = await db().staff.findUnique({ where: { id: input.id }, include });
  if (!target) throw fail.notFound('Staff member');
  if (target.role === 'OWNER' && target.id !== input.actingStaffId) throw fail.forbidden('Owner accounts are not changed here');
  const pin = generatePin();
  const pinHash = await hashPin(pin);
  await db().$transaction(async (tx) => {
    await tx.staff.update({ where: { id: target.id }, data: { pinHash, pinChangedAt: null, failedPinAttempts: 0, lockedUntil: null } });
    await writeAudit(tx, input.ctx, { action: 'staff.reset_pin', entityType: 'Staff', entityId: target.id });
  });
  await revokeAllSessions({ staffId: target.id });
  return { staff: toRow(target, await stampsGivenToday(db(), target.id, input.now ?? new Date())), temporaryPin: pin };
}
