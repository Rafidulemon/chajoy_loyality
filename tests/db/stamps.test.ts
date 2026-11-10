import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import { verifyLedger } from '@/server/domain/invariants';
import { addStampsAtCounter, adjustStamps, undoStamps } from '@/server/domain/stamps';
import { actorOf, cardOf, makeBranch, makeCustomer, makeStaff, resetProgram, setProgram } from './helpers';

// A fixed Dhaka afternoon, so the daily limit does not depend on when the test runs.
const AT = new Date('2026-11-09T08:00:00Z');
const at = (minutes: number) => new Date(AT.getTime() + minutes * 60_000);
const key = () => randomUUID();

let branch: Awaited<ReturnType<typeof makeBranch>>;
let cashier: Awaited<ReturnType<typeof makeStaff>>;
let cashier2: Awaited<ReturnType<typeof makeStaff>>;
let manager: Awaited<ReturnType<typeof makeStaff>>;
let owner: Awaited<ReturnType<typeof makeStaff>>;

const asCashier = () => actorOf(cashier, branch.id);
/** A customer who joined an hour before the test's clock, so every ledger row of the test is newer than the welcome stamp. */
const newCustomer = () => makeCustomer({ at: at(-60) });

beforeAll(async () => {
  branch = await makeBranch('Stamps');
  cashier = await makeStaff('CASHIER', [branch.id]);
  cashier2 = await makeStaff('CASHIER', [branch.id]);
  manager = await makeStaff('MANAGER', [branch.id]);
  owner = await makeStaff('OWNER');
});
afterEach(resetProgram);
afterAll(async () => {
  expect(await verifyLedger(db())).toEqual([]);
  await closeDb();
});

describe('giving stamps at the counter', () => {
  it('adds the stamp, writes one ledger row and counts one visit per outlet and day', async () => {
    const c = await newCustomer();
    expect((await cardOf(c.id)).stamps).toBe(1); // the welcome stamp (BR-17)

    const first = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    expect(first.card).toMatchObject({ stamps: 2, lifetimeStamps: 2, visits: 1 });
    expect(first.entry).toMatchObject({ count: 1, source: 'PURCHASE', branchId: branch.id, staffId: cashier.id, stampsAfter: 2, completedCards: 0, overrideById: null });
    expect(first.replayed).toBe(false);

    const second = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(30) });
    expect(second.card).toMatchObject({ stamps: 3, lifetimeStamps: 3, visits: 1 }); // same outlet, same day: still one visit
    expect(second.givenToday).toBe(2);
  });

  it('counts a visit at a second outlet on the same day (BR-05: stamps work at every outlet)', async () => {
    const other = await makeBranch('Second');
    const c = await newCustomer();
    await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const second = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: actorOf(cashier, other.id), at: at(5) });
    expect(second.card.visits).toBe(2);
  });

  it('refuses an unknown customer and a session with no outlet', async () => {
    await expect(addStampsAtCounter({ customerId: randomUUID(), count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const c = await newCustomer();
    await expect(addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: actorOf(cashier, null), at: at(0) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('adds at most what the open card still needs (CA-05)', async () => {
    await setProgram({ dailyLimit: 0 });
    const c = await newCustomer(); // 1 of 10
    await expect(addStampsAtCounter({ customerId: c.id, count: 10, idempotencyKey: key(), actor: asCashier(), at: at(0) })).rejects.toMatchObject({ code: 'EXCEEDS_CARD', details: { remaining: 9 } });
    expect((await cardOf(c.id)).stamps).toBe(1);
  });
});

describe('the daily limit (BR-02, BR-03)', () => {
  it('blocks stamps beyond the limit, and welcome stamps do not count against it', async () => {
    const c = await newCustomer(); // has a welcome stamp, which must not use up the limit
    await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await expect(addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(10) })).rejects.toMatchObject({
      code: 'DAILY_LIMIT_REACHED',
      details: { limit: 2, givenToday: 2, room: 0 },
    });
    expect((await cardOf(c.id)).stamps).toBe(3);
  });

  it("lets a cashier go over it with a manager's approval, and records who approved", async () => {
    const c = await newCustomer();
    await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const over = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), approverId: manager.id, at: at(10) });
    expect(over.entry.overrideById).toBe(manager.id);
    expect(over.card.stamps).toBe(4);
  });

  it('lets a manager or owner go over it themselves, recorded as their own override', async () => {
    const c = await newCustomer();
    await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const byManager = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: actorOf(manager, branch.id), at: at(10) });
    expect(byManager.entry.overrideById).toBe(manager.id);
    const byOwner = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: actorOf(owner, branch.id), at: at(20) });
    expect(byOwner.entry.overrideById).toBe(owner.id);
  });

  it('starts again the next day in Dhaka', async () => {
    const c = await newCustomer();
    await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const nextDay = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(24 * 60) });
    expect(nextDay.card.stamps).toBe(5);
    expect(nextDay.givenToday).toBe(2);
  });

  it('draws the day boundary at midnight Dhaka time, not UTC', async () => {
    const c = await newCustomer();
    // 17:50 UTC is 23:50 in Dhaka; 18:10 UTC is 00:10 the next day.
    const lateNight = new Date('2026-11-09T17:50:00Z');
    const afterMidnight = new Date('2026-11-09T18:10:00Z');
    await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: lateNight });
    const next = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: afterMidnight });
    expect(next.givenToday).toBe(2);
  });

  it('has no limit when the program says 0', async () => {
    await setProgram({ dailyLimit: 0 });
    const c = await newCustomer();
    await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const more = await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: key(), actor: asCashier(), at: at(5) });
    expect(more.card.stamps).toBe(7);
    expect(more.entry.overrideById).toBeNull();
  });

  it('cannot be passed by tapping many times at once: only what fits gets through', async () => {
    const c = await newCustomer();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(2);
    expect(refused).toHaveLength(4);
    for (const r of refused) expect(r.reason).toMatchObject({ code: 'DAILY_LIMIT_REACHED' });
    expect((await cardOf(c.id)).stamps).toBe(3); // welcome + 2
  });
});

describe('a retried request never stamps twice (CA-20)', () => {
  it('returns the first result for the same key', async () => {
    const c = await newCustomer();
    const k = key();
    const first = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(0) });
    const retry = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(1) });
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
    expect((await cardOf(c.id)).stamps).toBe(2);
    expect(await db().stampEntry.count({ where: { customerId: c.id, source: 'PURCHASE' } })).toBe(1);
  });

  it('refuses the same key for a different request', async () => {
    const c = await newCustomer();
    const k = key();
    await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(0) });
    await expect(addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: k, actor: asCashier(), at: at(1) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const other = await newCustomer();
    await expect(addStampsAtCounter({ customerId: other.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(1) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('stamps once when the same request arrives several times at the same moment', async () => {
    const c = await newCustomer();
    const k = key();
    const results = await Promise.all(Array.from({ length: 4 }, () => addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(0) })));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
    expect((await cardOf(c.id)).stamps).toBe(2);
  });

  it('lets two cashiers use the same key without clashing', async () => {
    const a = await newCustomer();
    const b = await newCustomer();
    const k = key();
    await addStampsAtCounter({ customerId: a.id, count: 1, idempotencyKey: k, actor: asCashier(), at: at(0) });
    const other = await addStampsAtCounter({ customerId: b.id, count: 1, idempotencyKey: k, actor: actorOf(cashier2, branch.id), at: at(0) });
    expect(other.replayed).toBe(false);
  });
});

describe('completing a card (BR-07, BR-08, BR-09)', () => {
  it('issues a voucher at once and starts a new card', async () => {
    await setProgram({ stampsRequired: 4, dailyLimit: 0 });
    const c = await newCustomer(); // 1 of 4
    const r = await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: key(), actor: asCashier(), at: at(0) });

    expect(r.completed).toBe(1);
    expect(r.card).toMatchObject({ stamps: 0, rewardsEarned: 1, lifetimeStamps: 4 });
    expect(r.entry).toMatchObject({ completedCards: 1, stampsAfter: 0 });

    const [v] = r.vouchers;
    expect(v.code).toMatch(/^CJ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(v).toMatchObject({ source: 'CARD', customerId: c.id, stampsConsumed: 4, titleEn: 'Free bubble tea, scoop or milkshake', triggerEntryId: r.entry.id });
    expect(v.expiresAt.getTime() - v.issuedAt.getTime()).toBe(30 * 86_400_000); // BR-08: 30 days
    expect((v.choices as { id: string }[]).map((x) => x.id)).toEqual(['bubble-tea', 'scoop', 'milkshake']); // BR-09
    expect(await db().notification.count({ where: { customerId: c.id, kind: 'REWARD_UNLOCKED' } })).toBe(1);
  });

  it('keeps the title and items a voucher was issued with when the program changes later (BR-14)', async () => {
    await setProgram({ stampsRequired: 4, dailyLimit: 0 });
    const c = await newCustomer();
    const r = await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await setProgram({ rewardItems: ['sundae'] });
    const stored = await db().voucher.findUniqueOrThrow({ where: { id: r.vouchers[0].id } });
    expect(stored.titleEn).toBe('Free bubble tea, scoop or milkshake');
    expect((stored.choices as { id: string }[]).map((x) => x.id)).toEqual(['bubble-tea', 'scoop', 'milkshake']);
  });

  it('cannot be undone once it completed the card (BR-04)', async () => {
    await setProgram({ stampsRequired: 4, dailyLimit: 0 });
    const c = await newCustomer();
    const r = await addStampsAtCounter({ customerId: c.id, count: 3, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await expect(undoStamps({ entryId: r.entry.id, actor: asCashier(), at: at(1) })).rejects.toMatchObject({ code: 'UNDO_NOT_ALLOWED', details: { reason: 'COMPLETED_CARD' } });
  });
});

describe('undoing stamps (CA-07, BR-04)', () => {
  it('takes the stamps back with a new ledger row that points at the old one', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const undone = await undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(3) });

    expect(undone.card).toMatchObject({ stamps: 1, lifetimeStamps: 1, visits: 1 }); // the visit stays: the customer was there
    expect(undone.entry).toMatchObject({ count: -2, source: 'PURCHASE', reversesId: added.entry.id });
    expect(undone.givenToday).toBe(0); // the cancelled stamps no longer count against the daily limit
    expect(await db().stampEntry.findUniqueOrThrow({ where: { id: added.entry.id } })).toMatchObject({ count: 2 }); // the original is untouched
  });

  it('frees the daily limit again', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(1) });
    const again = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(2) });
    expect(again.card.stamps).toBe(3);
  });

  it('cannot be done twice', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(1) });
    await expect(undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(2) })).rejects.toMatchObject({ details: { reason: 'ALREADY_UNDONE' } });
  });

  it('cannot be done twice at the same moment', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    const results = await Promise.allSettled([undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(1) }), undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(1) })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await cardOf(c.id)).stamps).toBe(1);
  });

  it('is limited to the cashier who added them, but a manager can undo anyone within the window', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await expect(undoStamps({ entryId: added.entry.id, actor: actorOf(cashier2, branch.id), at: at(1) })).rejects.toMatchObject({ details: { reason: 'NOT_YOURS' } });
    const byManager = await undoStamps({ entryId: added.entry.id, actor: actorOf(manager, branch.id), at: at(2) });
    expect(byManager.card.stamps).toBe(1);
  });

  it('is only possible straight after adding', async () => {
    const c = await newCustomer();
    const added = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await expect(undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(11) })).rejects.toMatchObject({ details: { reason: 'TOO_LATE' } });
    await expect(undoStamps({ entryId: added.entry.id, actor: asCashier(), at: at(10) })).resolves.toBeDefined();
  });

  it('is refused when something else happened on the card since', async () => {
    const c = await newCustomer();
    const first = await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(0) });
    await addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: key(), actor: asCashier(), at: at(1) });
    await expect(undoStamps({ entryId: first.entry.id, actor: asCashier(), at: at(2) })).rejects.toMatchObject({ details: { reason: 'NOT_LATEST' } });
  });

  it('cannot undo something that is not a counter purchase', async () => {
    const c = await newCustomer();
    const welcome = await db().stampEntry.findFirstOrThrow({ where: { customerId: c.id, source: 'WELCOME' } });
    await expect(undoStamps({ entryId: welcome.id, actor: actorOf(manager, branch.id), at: at(0) })).rejects.toMatchObject({ details: { reason: 'NOT_A_PURCHASE' } });
    await expect(undoStamps({ entryId: randomUUID(), actor: asCashier(), at: at(0) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('manager adjustments (MG-07)', () => {
  const ctx = () => ({ requestId: randomUUID(), actor: { type: 'STAFF' as const, id: manager.id } });

  it('adds stamps with a reason, fills the card and carries the rest over', async () => {
    await setProgram({ stampsRequired: 4 });
    const c = await newCustomer(); // 1 of 4
    const r = await adjustStamps({ customerId: c.id, delta: 6, reason: 'Missed stamps last week', actor: actorOf(manager, null), ctx: ctx(), at: at(0) });

    expect(r.completed).toBe(1); // 1 + 6 = 7 = one card + 3
    expect(r.card).toMatchObject({ stamps: 3, rewardsEarned: 1, lifetimeStamps: 7 });
    expect(r.entry).toMatchObject({ source: 'ADJUSTMENT', count: 6, reason: 'Missed stamps last week', staffId: manager.id, branchId: null });
    expect(r.vouchers).toHaveLength(1);
  });

  it('does not use up the daily limit (BR-03)', async () => {
    const c = await newCustomer();
    await adjustStamps({ customerId: c.id, delta: 2, reason: 'Goodwill', actor: actorOf(manager, null), ctx: ctx(), at: at(0) });
    const counter = await addStampsAtCounter({ customerId: c.id, count: 2, idempotencyKey: key(), actor: asCashier(), at: at(5) });
    expect(counter.card.stamps).toBe(5);
  });

  it('takes stamps away, but never below an empty card', async () => {
    const c = await newCustomer(); // 1 stamp
    await expect(adjustStamps({ customerId: c.id, delta: -2, reason: 'Wrong card', actor: actorOf(manager, null), ctx: ctx(), at: at(0) })).rejects.toMatchObject({ code: 'STAMPS_BELOW_ZERO' });
    const ok = await adjustStamps({ customerId: c.id, delta: -1, reason: 'Wrong card', actor: actorOf(manager, null), ctx: ctx(), at: at(1) });
    expect(ok.card.stamps).toBe(0);
  });

  it('is written to the audit log with before and after', async () => {
    const c = await newCustomer();
    const requestId = randomUUID();
    await adjustStamps({ customerId: c.id, delta: 1, reason: 'Audit me', actor: actorOf(manager, null), ctx: { requestId, actor: { type: 'STAFF', id: manager.id } }, at: at(0) });
    const row = await db().auditLog.findFirstOrThrow({ where: { entityType: 'Customer', entityId: c.id, action: 'stamps.adjust' } });
    expect(row).toMatchObject({ actorType: 'STAFF', actorId: manager.id, requestId });
    expect(row.before).toMatchObject({ stamps: 1 });
    expect(row.after).toMatchObject({ stamps: 2, delta: 1, reason: 'Audit me' });
  });
});

describe('the ledger is append-only (CA-19, MG-23)', () => {
  it('refuses to change or delete a stamp entry, even with direct SQL', async () => {
    const c = await newCustomer();
    const entry = await db().stampEntry.findFirstOrThrow({ where: { customerId: c.id } });
    await expect(db().$executeRaw`UPDATE "StampEntry" SET "count" = 99 WHERE "id" = ${entry.id}::uuid`).rejects.toThrow(/append-only/);
    await expect(db().$executeRaw`DELETE FROM "StampEntry" WHERE "id" = ${entry.id}::uuid`).rejects.toThrow(/append-only/);
  });

  it('refuses to change or delete an audit log row', async () => {
    const c = await newCustomer();
    await adjustStamps({ customerId: c.id, delta: 1, reason: 'Trigger check', actor: actorOf(manager, null), ctx: { actor: { type: 'STAFF', id: manager.id } }, at: at(0) });
    const row = await db().auditLog.findFirstOrThrow({ where: { entityId: c.id } });
    await expect(db().$executeRaw`UPDATE "AuditLog" SET "action" = 'x' WHERE "id" = ${row.id}::uuid`).rejects.toThrow(/append-only/);
    await expect(db().$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${row.id}::uuid`).rejects.toThrow(/append-only/);
  });

  it('refuses an adjustment with no reason, even with direct SQL', async () => {
    const c = await newCustomer();
    await expect(
      db().$executeRaw`INSERT INTO "StampEntry" ("id", "customerId", "count", "source", "stampsAfter") VALUES (${randomUUID()}::uuid, ${c.id}::uuid, 1, 'ADJUSTMENT', 2)`,
    ).rejects.toThrow(/adjustment_needs_reason/);
  });
});
