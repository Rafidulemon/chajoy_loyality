import 'server-only';
import { db, isUniqueViolation, lockCard, type Tx } from '../db';
import { fail } from '../errors';
import type { Card, Offer, Voucher } from '@/generated/prisma/client';
import { issueOfferVoucher, writeStamps } from './ledger';
import { getProgramLocked } from './program';

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** An offer is shown while it is live: not paused, not deleted, started and not past its end (BR-19). */
export const liveOfferWhere = (now: Date) => ({
  status: 'LIVE' as const,
  deletedAt: null,
  startsAt: { lte: now },
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

export async function listLiveOffers(tx: Tx, now: Date): Promise<Offer[]> {
  return tx.offer.findMany({ where: liveOfferWhere(now), orderBy: { createdAt: 'desc' } });
}

/** Offers a customer has to claim first. The rest apply automatically or are shown at the counter (BR-20, BR-21). */
export const isClaimable = (o: Pick<Offer, 'kind'>) => o.kind === 'STAMP' || o.kind === 'VOUCHER';

/**
 * CU-: a customer claims an offer. Once per customer (BR-20), enforced twice: a check for a clear error and the unique
 * key as the guarantee. A bonus-stamp offer adds its stamps at once (and may fill the card); a free-item offer creates
 * a voucher valid for the offer's own days.
 */
export async function claimOffer(input: { customerId: string; offerId: string; at?: Date }): Promise<{ card: Card; vouchers: Voucher[]; completed: number }> {
  const at = input.at ?? new Date();
  try {
    return await db().$transaction(async (tx) => {
      // Lock order, always: the program (shared), then the customer's card. See getProgramLocked.
      const program = await getProgramLocked(tx);
      if (!(await lockCard(tx, input.customerId))) throw fail.notFound('Customer');

      const offer = await tx.offer.findFirst({ where: { id: input.offerId, deletedAt: null } });
      if (!offer || offer.status !== 'LIVE') throw fail.notFound('Offer');
      if (offer.startsAt > at || (offer.endsAt && offer.endsAt <= at)) throw fail.conflict('OFFER_ENDED', 'This offer has ended');
      if (!isClaimable(offer)) throw fail.unprocessable('OFFER_NOT_CLAIMABLE', 'This offer is shown at the counter, there is nothing to claim');
      if (await tx.offerClaim.findUnique({ where: { offerId_customerId: { offerId: offer.id, customerId: input.customerId } }, select: { id: true } })) {
        throw fail.conflict('ALREADY_CLAIMED', 'You already claimed this offer');
      }

      const claim = await tx.offerClaim.create({ data: { offerId: offer.id, customerId: input.customerId, claimedAt: at } });
      const card = await tx.card.findUniqueOrThrow({ where: { customerId: input.customerId } });

      if (offer.kind === 'STAMP') {
        const written = await writeStamps(tx, {
          customerId: input.customerId,
          card,
          program,
          delta: offer.bonusStamps ?? 1,
          source: 'OFFER',
          offerId: offer.id,
          at,
        });
        return { card: written.card, vouchers: written.vouchers, completed: written.completed };
      }

      const voucher = await issueOfferVoucher(tx, { customerId: input.customerId, offer, at });
      await tx.offerClaim.update({ where: { id: claim.id }, data: { voucherId: voucher.id } });
      const updated = await tx.card.update({ where: { id: card.id }, data: { version: { increment: 1 } } });
      return { card: updated, vouchers: [voucher], completed: 0 };
    }, TX_OPTIONS);
  } catch (e) {
    if (isUniqueViolation(e)) throw fail.conflict('ALREADY_CLAIMED', 'You already claimed this offer');
    throw e;
  }
}
