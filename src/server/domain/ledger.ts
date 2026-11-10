import 'server-only';
import type { Tx } from '../db';
import { fail } from '../errors';
import { generateVoucherCode } from '../crypto';
import { applyStamps, CARD_VOUCHER_DAYS, rewardTitle } from '@/lib/domain/rules';
import { addDays, dhakaDateColumn } from '@/lib/domain/time';
import { rewardItemsOf } from './program';
import type { Card, Offer, Program, StampEntry, Voucher } from '@/generated/prisma/client';
import type { StampSource } from '@/generated/prisma/enums';

/**
 * The only code that changes a customer's stamps and cards. Everything that earns, takes away or converts stamps
 * (counter stamps, welcome stamps, offer stamps, manager adjustments, undo, program changes) goes through here, so the
 * ledger, the card counters and the vouchers can never disagree.
 *
 * Callers must hold the row lock on the customer's card (`lockCard`) for the whole transaction, and always lock the card
 * before anything else, so two operations on one customer run one after the other and locks are never taken in a loop.
 */

type CardCounters = Pick<Card, 'id' | 'stamps' | 'visits' | 'lifetimeStamps' | 'rewardsEarned' | 'lastVisitAt'>;

/** The last visit only ever moves forward, so a late-recorded older visit (a redemption in a seed or an import) cannot move it back. */
const laterVisit = (current: Date | null, at: Date) => (!current || at > current ? at : current);

export type WriteStampsInput = {
  customerId: string;
  card: CardCounters;
  program: Program;
  /** Stamps added, or taken away when negative. Not 0. */
  delta: number;
  source: StampSource;
  at: Date;
  branchId?: string | null;
  staffId?: string | null;
  offerId?: string | null;
  reason?: string | null;
  /** Set when this entry cancels an earlier one (an undo). */
  reversesId?: string | null;
  overrideById?: string | null;
  idempotencyKey?: string | null;
  /** True for a stamp at the counter: it counts as a visit, once per customer, outlet and day. */
  visit?: boolean;
};

export type WriteStampsResult = { entry: StampEntry; card: Card; vouchers: Voucher[]; completed: number };

export async function writeStamps(tx: Tx, input: WriteStampsInput): Promise<WriteStampsResult> {
  let math;
  try {
    math = applyStamps(input.card.stamps, input.delta, input.program.stampsRequired);
  } catch (e) {
    if (e instanceof RangeError) throw fail.unprocessable('STAMPS_BELOW_ZERO', 'A card cannot have fewer than 0 stamps');
    throw e;
  }

  // BR-06 / BR-15: when stamps lapse is fixed at the moment they are earned, from the program as it is then.
  const expiresAt = input.delta > 0 && input.program.expiryDays > 0 ? addDays(input.at, input.program.expiryDays) : null;

  const entry = await tx.stampEntry.create({
    data: {
      customerId: input.customerId,
      count: input.delta,
      source: input.source,
      branchId: input.branchId ?? null,
      staffId: input.staffId ?? null,
      offerId: input.offerId ?? null,
      reason: input.reason ?? null,
      reversesId: input.reversesId ?? null,
      overrideById: input.overrideById ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      stampsAfter: math.stamps,
      completedCards: math.completed,
      expiresAt,
      createdAt: input.at,
    },
  });

  const vouchers = await issueCardVouchers(tx, { customerId: input.customerId, program: input.program, times: math.completed, triggerEntryId: entry.id, at: input.at });

  const newVisit = input.visit && input.branchId ? await recordVisit(tx, input.customerId, input.branchId, input.at) : false;

  const card = await tx.card.update({
    where: { id: input.card.id },
    data: {
      stamps: math.stamps,
      lifetimeStamps: { increment: input.delta },
      rewardsEarned: { increment: math.completed },
      ...(newVisit ? { visits: { increment: 1 } } : {}),
      ...(input.visit ? { lastVisitAt: laterVisit(input.card.lastVisitAt, input.at) } : {}),
      version: { increment: 1 },
    },
  });

  return { entry, card, vouchers, completed: math.completed };
}

/** Records a visit once per customer, outlet and day. Returns true when this is the first of the day (so the card's visit count goes up). */
export async function recordVisit(tx: Tx, customerId: string, branchId: string, at: Date): Promise<boolean> {
  const { count } = await tx.visit.createMany({ data: [{ customerId, branchId, day: dhakaDateColumn(at), createdAt: at }], skipDuplicates: true });
  return count === 1;
}

/** A visit that is not tied to a stamp, for example a redemption or a customer added at the counter. Updates the card's visit count. */
export async function touchVisit(tx: Tx, card: Pick<Card, 'id' | 'lastVisitAt'>, customerId: string, branchId: string, at: Date) {
  const newVisit = await recordVisit(tx, customerId, branchId, at);
  return tx.card.update({
    where: { id: card.id },
    data: { ...(newVisit ? { visits: { increment: 1 } } : {}), lastVisitAt: laterVisit(card.lastVisitAt, at), version: { increment: 1 } },
  });
}

type ChoiceJson = { id: string; nameBn: string; nameEn: string };

/** Issues the reward vouchers for filled cards (BR-07, BR-08, BR-09). Title and items are copied from the program as it is right now (BR-14). */
export async function issueCardVouchers(
  tx: Tx,
  input: { customerId: string; program: Program; times: number; triggerEntryId: string | null; at: Date },
): Promise<Voucher[]> {
  if (input.times <= 0) return [];
  const items = rewardItemsOf(input.program.rewardItems);
  const title = rewardTitle(items);
  const choices: ChoiceJson[] = items.map((i) => ({ id: i.id, nameBn: i.name.bn, nameEn: i.name.en }));
  const vouchers: Voucher[] = [];
  for (let i = 0; i < input.times; i++) {
    const voucher = await tx.voucher.create({
      data: {
        code: await freshCode(tx),
        customerId: input.customerId,
        source: 'CARD',
        triggerEntryId: input.triggerEntryId,
        stampsConsumed: input.program.stampsRequired,
        titleBn: title.bn,
        titleEn: title.en,
        sourceBn: 'কার্ড সম্পূর্ণ',
        sourceEn: 'Card completed',
        choices,
        issuedAt: input.at,
        expiresAt: addDays(input.at, CARD_VOUCHER_DAYS),
      },
    });
    await tx.notification.create({
      data: { customerId: input.customerId, kind: 'REWARD_UNLOCKED', params: { voucherId: voucher.id, title: title }, createdAt: input.at },
    });
    vouchers.push(voucher);
  }
  return vouchers;
}

/** A voucher for a claimed free-item offer, valid for the offer's own number of days (BR-08, BR-20). */
export async function issueOfferVoucher(tx: Tx, input: { customerId: string; offer: Offer; at: Date }): Promise<Voucher> {
  const { offer } = input;
  const voucher = await tx.voucher.create({
    data: {
      code: await freshCode(tx),
      customerId: input.customerId,
      source: 'OFFER',
      offerId: offer.id,
      titleBn: offer.rewardBn ?? offer.titleBn,
      titleEn: offer.rewardEn ?? offer.titleEn,
      sourceBn: `অফার: ${offer.titleBn}`,
      sourceEn: `Offer: ${offer.titleEn}`,
      choices: [],
      issuedAt: input.at,
      expiresAt: addDays(input.at, offer.voucherDays ?? 7),
    },
  });
  await tx.notification.create({
    data: { customerId: input.customerId, kind: 'REWARD_UNLOCKED', params: { voucherId: voucher.id, title: { bn: voucher.titleBn, en: voucher.titleEn } }, createdAt: input.at },
  });
  return voucher;
}

/** A code that no voucher has. A clash among 32^8 possibilities is not realistic, but it is checked rather than assumed. */
async function freshCode(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateVoucherCode();
    if (!(await tx.voucher.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error('could not generate a unique voucher code');
}
