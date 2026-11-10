import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import { verifyLedger } from '@/server/domain/invariants';
import { claimOffer, listLiveOffers } from '@/server/domain/offers';
import { addStampsAtCounter } from '@/server/domain/stamps';
import { actorOf, cardOf, makeBranch, makeCustomer, makeStaff, resetProgram, setProgram } from './helpers';

const NOW = new Date('2026-11-09T08:00:00Z');
const DAY = 86_400_000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let branch: Awaited<ReturnType<typeof makeBranch>>;
let cashier: Awaited<ReturnType<typeof makeStaff>>;

type OfferData = Parameters<ReturnType<typeof db>['offer']['create']>[0]['data'];
const makeOffer = (data: Partial<OfferData> = {}) =>
  db().offer.create({
    data: {
      kind: 'STAMP',
      badgeBn: '+১',
      badgeEn: '+1',
      titleBn: 'পরীক্ষা অফার',
      titleEn: 'Test offer',
      bodyBn: 'বিবরণ',
      bodyEn: 'Body',
      bonusStamps: 1,
      bg: '#97C334',
      fg: '#171717',
      startsAt: new Date(NOW.getTime() - 10 * DAY),
      endsAt: new Date(NOW.getTime() + 5 * DAY),
      ...data,
    } as OfferData,
  });

beforeAll(async () => {
  branch = await makeBranch('Offers');
  cashier = await makeStaff('CASHIER', [branch.id]);
});
afterEach(resetProgram);
afterAll(async () => {
  expect(await verifyLedger(db())).toEqual([]);
  await closeDb();
});

describe('claiming an offer (BR-20)', () => {
  it('adds the bonus stamp at once, without using the daily limit', async () => {
    const offer = await makeOffer({ bonusStamps: 2 });
    const c = await makeCustomer({ at: at(-60) });
    const claimed = await claimOffer({ customerId: c.id, offerId: offer.id, at: at(0) });
    expect(claimed.card.stamps).toBe(3); // welcome + 2
    const entry = await db().stampEntry.findFirstOrThrow({ where: { customerId: c.id, source: 'OFFER' } });
    expect(entry).toMatchObject({ count: 2, offerId: offer.id, staffId: null, branchId: null });

    // the daily limit (2) is still free for the counter
    const counter = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: randomUUID(), actor: actorOf(cashier, branch.id), at: at(5) });
    expect(counter.card.stamps).toBe(5);
  });

  it('can complete the card and issue the reward', async () => {
    await setProgram({ stampsRequired: 4 });
    const offer = await makeOffer({ bonusStamps: 3 });
    const c = await makeCustomer({ at: at(-60) }); // 1 of 4
    const claimed = await claimOffer({ customerId: c.id, offerId: offer.id, at: at(0) });
    expect(claimed.completed).toBe(1);
    expect(claimed.vouchers).toHaveLength(1);
    expect(claimed.card).toMatchObject({ stamps: 0, rewardsEarned: 1 });
  });

  it('can be claimed once per customer, even when tapped many times at once', async () => {
    const offer = await makeOffer();
    const c = await makeCustomer({ at: at(-60) });
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => claimOffer({ customerId: c.id, offerId: offer.id, at: at(0) })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) expect(r.reason).toMatchObject({ code: 'ALREADY_CLAIMED' });
    expect((await cardOf(c.id)).stamps).toBe(2);
    expect(await db().offerClaim.count({ where: { offerId: offer.id, customerId: c.id } })).toBe(1);
  });

  it('lets different customers claim the same offer', async () => {
    const offer = await makeOffer();
    const [a, b] = await Promise.all([makeCustomer({ at: at(-60) }), makeCustomer({ at: at(-60) })]);
    await claimOffer({ customerId: a.id, offerId: offer.id, at: at(0) });
    await expect(claimOffer({ customerId: b.id, offerId: offer.id, at: at(0) })).resolves.toBeDefined();
  });

  it('creates a voucher valid for the offers own days when the offer is a free item', async () => {
    const offer = await makeOffer({ kind: 'VOUCHER', bonusStamps: null, rewardBn: 'ফ্রি টপিং', rewardEn: 'Free topping', voucherDays: 7 });
    const c = await makeCustomer({ at: at(-60) });
    const claimed = await claimOffer({ customerId: c.id, offerId: offer.id, at: at(0) });
    const [v] = claimed.vouchers;
    expect(v).toMatchObject({ source: 'OFFER', offerId: offer.id, titleEn: 'Free topping', sourceEn: 'Offer: Test offer' });
    expect(v.expiresAt.getTime() - v.issuedAt.getTime()).toBe(7 * DAY);
    expect(v.choices).toEqual([]);
    expect((await db().offerClaim.findFirstOrThrow({ where: { offerId: offer.id, customerId: c.id } })).voucherId).toBe(v.id);
    expect((await cardOf(c.id)).stamps).toBe(1); // no stamps, only a voucher
  });

  it('is refused for offers that are paused, deleted, ended, not started or shown at the counter', async () => {
    const c = await makeCustomer({ at: at(-60) });
    const paused = await makeOffer({ status: 'PAUSED' });
    const deleted = await makeOffer({ deletedAt: new Date() });
    const ended = await makeOffer({ endsAt: new Date(NOW.getTime() - 1000) });
    const future = await makeOffer({ startsAt: new Date(NOW.getTime() + DAY), endsAt: null });
    const info = await makeOffer({ kind: 'INFO', bonusStamps: null });
    const double = await makeOffer({ kind: 'DOUBLE', bonusStamps: null });
    await expect(claimOffer({ customerId: c.id, offerId: paused.id, at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(claimOffer({ customerId: c.id, offerId: deleted.id, at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(claimOffer({ customerId: c.id, offerId: ended.id, at: at(0) })).rejects.toMatchObject({ code: 'OFFER_ENDED' });
    await expect(claimOffer({ customerId: c.id, offerId: future.id, at: at(0) })).rejects.toMatchObject({ code: 'OFFER_ENDED' });
    await expect(claimOffer({ customerId: c.id, offerId: info.id, at: at(0) })).rejects.toMatchObject({ code: 'OFFER_NOT_CLAIMABLE' });
    await expect(claimOffer({ customerId: c.id, offerId: double.id, at: at(0) })).rejects.toMatchObject({ code: 'OFFER_NOT_CLAIMABLE' });
    await expect(claimOffer({ customerId: c.id, offerId: randomUUID(), at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await cardOf(c.id)).stamps).toBe(1);
  });
});

describe('which offers customers see (BR-19)', () => {
  it('lists live offers and hides paused, deleted, ended and not yet started ones', async () => {
    const live = await makeOffer({ titleEn: 'Visible' });
    const noEnd = await makeOffer({ titleEn: 'No end date', endsAt: null });
    const paused = await makeOffer({ status: 'PAUSED' });
    const deleted = await makeOffer({ deletedAt: new Date() });
    const ended = await makeOffer({ endsAt: new Date(NOW.getTime() - 1000) });
    const future = await makeOffer({ startsAt: new Date(NOW.getTime() + DAY) });
    const ids = (await listLiveOffers(db(), NOW)).map((o) => o.id);
    expect(ids).toContain(live.id);
    expect(ids).toContain(noEnd.id);
    for (const hidden of [paused, deleted, ended, future]) expect(ids).not.toContain(hidden.id);
  });
});
