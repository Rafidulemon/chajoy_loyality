import { randomInt, randomUUID } from 'node:crypto';
import { db } from '@/server/db';
import { hashPin } from '@/server/crypto';
import { createCustomer } from '@/server/domain/customers';
import type { StaffActor } from '@/server/domain/stamps';

/** Helpers for the database tests. Every test builds its own people with unique phone numbers, so tests never depend on each other. */

export const uniquePhone = () => `+88017${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;

export async function makeBranch(label = 'Test') {
  return db().branch.create({
    data: { slug: `t-${randomUUID().slice(0, 8)}`, nameBn: `${label} শাখা`, nameEn: `${label} outlet`, addressBn: 'ঠিকানা', addressEn: 'Address', latitude: 23.8, longitude: 90.4 },
  });
}

export async function makeStaff(role: 'CASHIER' | 'MANAGER' | 'OWNER', branchIds: string[] = [], opts: { pin?: string; active?: boolean; name?: string } = {}) {
  return db().staff.create({
    data: {
      phone: uniquePhone(),
      name: opts.name ?? `${role.toLowerCase()}-${randomUUID().slice(0, 4)}`,
      role,
      active: opts.active ?? true,
      pinHash: opts.pin ? await hashPin(opts.pin) : null,
      branches: { create: branchIds.map((branchId) => ({ branchId })) },
    },
  });
}

export const actorOf = (staff: { id: string; role: 'CASHIER' | 'MANAGER' | 'OWNER' }, branchId: string | null): StaffActor => ({ id: staff.id, role: staff.role, branchId });

export async function makeCustomer(opts: { at?: Date; name?: string } = {}) {
  const created = await db().$transaction((tx) => createCustomer(tx, { phone: uniquePhone(), name: opts.name ?? 'Test Customer', joinedVia: 'APP', at: opts.at }));
  return created.customer;
}

const DEFAULT_PROGRAM = { stampsRequired: 10, dailyLimit: 2, expiryDays: 90, minPurchase: 200, welcomeBonus: true, rewardItems: ['bubble-tea', 'scoop', 'milkshake'] };

/** Changes the program for one test. Call `resetProgram` in afterEach: the program is shared by every test in the run. */
export const setProgram = (patch: Partial<typeof DEFAULT_PROGRAM>) => db().program.update({ where: { id: 1 }, data: patch });
export const resetProgram = () => db().program.update({ where: { id: 1 }, data: DEFAULT_PROGRAM });

export const cardOf = (customerId: string) => db().card.findUniqueOrThrow({ where: { customerId } });
