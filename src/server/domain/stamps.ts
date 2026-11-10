import 'server-only';
import { db, isUniqueViolation, lockCard, type Tx } from '../db';
import { fail } from '../errors';
import { can, type StaffRole } from '@/lib/domain/permissions';
import { cardRoom, checkUndo, dailyRoom, type UndoRefusal } from '@/lib/domain/rules';
import { dhakaDayEnd, dhakaDayStart } from '@/lib/domain/time';
import type { Card, Program, StampEntry, Voucher } from '@/generated/prisma/client';
import { writeAudit, type RequestContext } from './audit';
import { writeStamps } from './ledger';
import { getProgramLocked } from './program';

/** The staff member doing the work and the outlet they are doing it at. */
export type StaffActor = { id: string; role: StaffRole; branchId: string | null };

export type StampOutcome = {
  entry: StampEntry;
  card: Card;
  vouchers: Voucher[];
  completed: number;
  /** Stamps from purchases given to this customer today, after this action. */
  givenToday: number;
  replayed: boolean;
};

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** Stamps from purchases already given to a customer today (Dhaka time). Welcome, offer and adjustment stamps do not count (BR-03). */
export async function givenToday(tx: Tx, customerId: string, at: Date): Promise<number> {
  const sum = await tx.stampEntry.aggregate({
    _sum: { count: true },
    where: { customerId, source: 'PURCHASE', createdAt: { gte: dhakaDayStart(at), lt: dhakaDayEnd(at) } },
  });
  return sum._sum.count ?? 0;
}

/**
 * CA-05, CA-06, CA-10: a cashier gives stamps at the counter.
 *
 * - One transaction holds the card's row lock, so two cashiers (or a double tap) can never both pass the daily limit.
 * - The idempotency key makes a retry safe (CA-20): the same key and customer returns the first result, nothing is stamped twice.
 * - Over the daily limit it needs a manager's approval (BR-02): a manager or owner doing it themselves, or the approver the
 *   route already verified by PIN. The approver is written on the ledger row.
 * - A purchase can add at most what the open card still needs (CA-05).
 */
export async function addStampsAtCounter(input: {
  customerId: string;
  count: number;
  idempotencyKey: string;
  actor: StaffActor;
  /** A manager or owner whose PIN the route has already checked. */
  approverId?: string | null;
  at?: Date;
}): Promise<StampOutcome> {
  const at = input.at ?? new Date();
  if (!input.actor.branchId) throw fail.badRequest('Choose the outlet you are working at first');
  const branchId = input.actor.branchId;

  try {
    return await db().$transaction(async (tx) => {
      // Lock order, always: the program (shared), then the customer's card. See getProgramLocked.
      const program = await getProgramLocked(tx);
      if (!(await lockCard(tx, input.customerId))) throw fail.notFound('Customer');

      const earlier = await tx.stampEntry.findUnique({ where: { staffId_idempotencyKey: { staffId: input.actor.id, idempotencyKey: input.idempotencyKey } } });
      if (earlier) {
        if (earlier.customerId !== input.customerId || earlier.count !== input.count) {
          throw fail.unprocessable('IDEMPOTENCY_KEY_REUSED', 'That request key was already used for a different stamp');
        }
        // One query at a time: a transaction has a single connection, so queries started together would only queue on it.
        const card = await tx.card.findUniqueOrThrow({ where: { customerId: input.customerId } });
        const vouchers = await tx.voucher.findMany({ where: { triggerEntryId: earlier.id } });
        const given = await givenToday(tx, input.customerId, at);
        return { entry: earlier, card, vouchers, completed: earlier.completedCards, givenToday: given, replayed: true };
      }

      const card = await tx.card.findUniqueOrThrow({ where: { customerId: input.customerId } });
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { deletedAt: true } });
      if (customer.deletedAt) throw fail.notFound('Customer');
      const given = await givenToday(tx, input.customerId, at);

      const remaining = cardRoom(card.stamps, program.stampsRequired);
      if (input.count > remaining) {
        throw fail.unprocessable('EXCEEDS_CARD', `The card needs only ${remaining} more stamp${remaining === 1 ? '' : 's'}`, { remaining });
      }

      const room = dailyRoom(program.dailyLimit, given);
      let overrideById: string | null = null;
      if (input.count > room) {
        if (input.approverId) overrideById = input.approverId;
        else if (can(input.actor.role, 'limit.override')) overrideById = input.actor.id;
        else {
          throw fail.conflict('DAILY_LIMIT_REACHED', `Daily limit reached: ${given} of ${program.dailyLimit} stamps given today`, { limit: program.dailyLimit, givenToday: given, room: Number.isFinite(room) ? room : null });
        }
      }

      const written = await writeStamps(tx, {
        customerId: input.customerId,
        card,
        program,
        delta: input.count,
        source: 'PURCHASE',
        at,
        branchId,
        staffId: input.actor.id,
        overrideById,
        idempotencyKey: input.idempotencyKey,
        visit: true,
      });
      return { entry: written.entry, card: written.card, vouchers: written.vouchers, completed: written.completed, givenToday: given + input.count, replayed: false };
    }, TX_OPTIONS);
  } catch (e) {
    // Two requests with the same key at the same moment: the loser hits the unique key. Run it again to return the winner's result.
    if (isUniqueViolation(e, 'idempotencyKey')) return addStampsAtCounter({ ...input, at });
    throw e;
  }
}

const UNDO_MESSAGES: Record<UndoRefusal, string> = {
  NOT_A_PURCHASE: 'Only stamps given at the counter can be undone',
  ALREADY_UNDONE: 'These stamps were already undone',
  COMPLETED_CARD: 'These stamps completed the card, so they cannot be undone. Ask a manager to adjust them',
  TOO_LATE: 'Stamps can only be undone straight after adding them. Ask a manager to adjust them',
  NOT_LATEST: 'Something else happened on this card since. Ask a manager to adjust it',
  NOT_YOURS: 'Only the cashier who added these stamps can undo them',
  CARD_CHANGED: 'The card changed since. Ask a manager to adjust it',
};

/** CA-07, BR-04: undo the stamps just added. The undo is a new ledger row that points at the original; nothing is deleted. */
export async function undoStamps(input: { entryId: string; actor: StaffActor; at?: Date }): Promise<StampOutcome> {
  const at = input.at ?? new Date();
  return db().$transaction(async (tx) => {
    const program = await getProgramLocked(tx);
    const first = await tx.stampEntry.findUnique({ where: { id: input.entryId }, select: { customerId: true } });
    if (!first) throw fail.notFound('Stamp entry');
    await lockCard(tx, first.customerId);

    // Read again under the lock: another request may have changed things between the first read and the lock.
    const entry = await tx.stampEntry.findUniqueOrThrow({ where: { id: input.entryId }, include: { reversedBy: { select: { id: true } } } });
    const latest = await tx.stampEntry.findFirst({ where: { customerId: entry.customerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    const card = await tx.card.findUniqueOrThrow({ where: { customerId: entry.customerId } });

    const verdict = checkUndo({
      entry,
      alreadyUndone: entry.reversedBy !== null,
      isLatest: latest?.id === entry.id,
      cardStamps: card.stamps,
      actor: input.actor,
      now: at,
    });
    if (!verdict.ok) throw fail.unprocessable('UNDO_NOT_ALLOWED', UNDO_MESSAGES[verdict.reason], { reason: verdict.reason });

    const written = await writeStamps(tx, {
      customerId: entry.customerId,
      card,
      program,
      delta: -entry.count,
      source: 'PURCHASE',
      at,
      branchId: input.actor.branchId ?? entry.branchId,
      staffId: input.actor.id,
      reversesId: entry.id,
    });
    const given = await givenToday(tx, entry.customerId, at);
    return { entry: written.entry, card: written.card, vouchers: [], completed: 0, givenToday: given, replayed: false };
  }, TX_OPTIONS);
}

/**
 * MG-07: management adds or takes away stamps by hand, with a reason (BR-04: corrections after the undo window).
 * It does not count against the daily limit (BR-03). Adding enough fills the card and issues a voucher, taking away
 * cannot go below an empty card. It is recorded in the ledger and in the audit log.
 */
export async function adjustStamps(input: { customerId: string; delta: number; reason: string; actor: StaffActor; ctx: RequestContext; at?: Date }): Promise<StampOutcome> {
  const at = input.at ?? new Date();
  return db().$transaction(async (tx) => {
    const program = await getProgramLocked(tx);
    if (!(await lockCard(tx, input.customerId))) throw fail.notFound('Customer');
    const card = await tx.card.findUniqueOrThrow({ where: { customerId: input.customerId } });
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, select: { deletedAt: true } });
    if (customer.deletedAt) throw fail.notFound('Customer');

    const written = await writeStamps(tx, {
      customerId: input.customerId,
      card,
      program,
      delta: input.delta,
      source: 'ADJUSTMENT',
      at,
      branchId: null,
      staffId: input.actor.id,
      reason: input.reason,
    });
    await writeAudit(tx, input.ctx, {
      action: 'stamps.adjust',
      entityType: 'Customer',
      entityId: input.customerId,
      before: { stamps: card.stamps, rewardsEarned: card.rewardsEarned },
      after: { stamps: written.card.stamps, rewardsEarned: written.card.rewardsEarned, delta: input.delta, reason: input.reason, entryId: written.entry.id },
      at,
    });
    const given = await givenToday(tx, input.customerId, at);
    return { entry: written.entry, card: written.card, vouchers: written.vouchers, completed: written.completed, givenToday: given, replayed: false };
  }, TX_OPTIONS);
}

export type { Program };
