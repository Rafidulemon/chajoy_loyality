import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import { verifyLedger } from '@/server/domain/invariants';
import { addStampsAtCounter } from '@/server/domain/stamps';
import { findVoucherByCode, redeemVoucher } from '@/server/domain/vouchers';
import { actorOf, cardOf, makeBranch, makeCustomer, makeStaff, resetProgram, setProgram } from './helpers';

const AT = new Date('2026-11-09T08:00:00Z');
const at = (minutes: number) => new Date(AT.getTime() + minutes * 60_000);
const DAY = 86_400_000;

let branch: Awaited<ReturnType<typeof makeBranch>>;
let cashier: Awaited<ReturnType<typeof makeStaff>>;
const actor = () => actorOf(cashier, branch.id);

/** A customer with a full card and the voucher it earned. Cards are 4 stamps here to keep the tests short. */
async function customerWithVoucher() {
  await setProgram({ stampsRequired: 4, dailyLimit: 0 });
  const c = await makeCustomer({ at: at(-60) });
  const r = await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: randomUUID(), actor: actor(), at: at(0) });
  return { customer: c, voucher: r.vouchers[0] };
}

beforeAll(async () => {
  branch = await makeBranch('Vouchers');
  cashier = await makeStaff('CASHIER', [branch.id]);
});
afterEach(resetProgram);
afterAll(async () => {
  expect(await verifyLedger(db())).toEqual([]);
  await closeDb();
});

describe('giving a reward (BR-08 to BR-11, CA-11, CA-12)', () => {
  it('records who gave it, where, when and which item was chosen', async () => {
    const { customer, voucher } = await customerWithVoucher();
    const result = await redeemVoucher({ voucherId: voucher.id, itemId: 'milkshake', actor: actor(), at: at(5) });

    expect(result.voucher).toMatchObject({ redeemedById: cashier.id, redeemedAtId: branch.id, chosenItemId: 'milkshake', chosenItemEn: 'Milkshake' });
    expect(result.voucher.redeemedAt).toEqual(at(5));
    expect(await db().notification.count({ where: { customerId: customer.id, kind: 'REWARD_REDEEMED' } })).toBe(1);
    expect((await cardOf(customer.id)).visits).toBe(1); // already counted for this outlet and day by the stamps
  });

  it('needs an item from the voucher when it offers a choice, and only from that list (BR-09)', async () => {
    const { voucher } = await customerWithVoucher();
    await expect(redeemVoucher({ voucherId: voucher.id, actor: actor(), at: at(5) })).rejects.toMatchObject({ code: 'ITEM_REQUIRED' });
    await expect(redeemVoucher({ voucherId: voucher.id, itemId: 'sundae', actor: actor(), at: at(5) })).rejects.toMatchObject({ code: 'ITEM_NOT_ALLOWED' });
    expect((await db().voucher.findUniqueOrThrow({ where: { id: voucher.id } })).redeemedAt).toBeNull();
  });

  it('works once: a used voucher is refused', async () => {
    const { voucher } = await customerWithVoucher();
    await redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: at(5) });
    await expect(redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: at(6) })).rejects.toMatchObject({ code: 'VOUCHER_USED' });
  });

  it('works once even when two cashiers give it at the same moment', async () => {
    const { voucher } = await customerWithVoucher();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: at(5) })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) expect(r.reason).toMatchObject({ code: 'VOUCHER_USED' });
  });

  it('is valid for exactly 30 days from issue (BR-08)', async () => {
    const { voucher } = await customerWithVoucher();
    await expect(redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: new Date(at(0).getTime() + 30 * DAY) })).rejects.toMatchObject({ code: 'VOUCHER_EXPIRED' });
    const lastMoment = await redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: new Date(at(0).getTime() + 30 * DAY - 1000) });
    expect(lastMoment.voucher.redeemedAt).not.toBeNull();
  });

  it('refuses an unknown voucher', async () => {
    await expect(redeemVoucher({ voucherId: randomUUID(), actor: actor(), at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('finding a voucher by its code (CA-12)', () => {
  it('ignores case, spaces and dashes', async () => {
    const { voucher } = await customerWithVoucher();
    const messy = voucher.code.toLowerCase().replace(/-/g, ' ');
    expect((await findVoucherByCode(messy)).id).toBe(voucher.id);
  });

  it('does not find a code that does not exist', async () => {
    await expect(findVoucherByCode('CJ-ZZZZ-ZZZZ')).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND', status: 404 });
    await expect(findVoucherByCode('not a code')).rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND', status: 404 });
  });
});

describe('vouchers are protected in the database itself (BR-08, BR-14)', () => {
  it('cannot be changed once redeemed, or deleted', async () => {
    const { voucher } = await customerWithVoucher();
    await redeemVoucher({ voucherId: voucher.id, itemId: 'scoop', actor: actor(), at: at(5) });
    await expect(db().$executeRaw`UPDATE "Voucher" SET "redeemedAt" = NULL, "redeemedById" = NULL WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/already redeemed/);
    await expect(db().$executeRaw`UPDATE "Voucher" SET "titleEn" = 'Free everything' WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/already redeemed/);
    await expect(db().$executeRaw`DELETE FROM "Voucher" WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/cannot be deleted/);
  });

  it('keeps its code, owner and title while unused', async () => {
    const { voucher } = await customerWithVoucher();
    await expect(db().$executeRaw`UPDATE "Voucher" SET "code" = 'CJ-AAAA-BBBB' WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/keeps the code/);
    await expect(db().$executeRaw`UPDATE "Voucher" SET "titleEn" = 'Free everything' WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/keeps the code/);
  });

  it('cannot be redeemed without saying who did it', async () => {
    const { voucher } = await customerWithVoucher();
    await expect(db().$executeRaw`UPDATE "Voucher" SET "redeemedAt" = now() WHERE "id" = ${voucher.id}::uuid`).rejects.toThrow(/redemption_is_attributed/);
  });
});
