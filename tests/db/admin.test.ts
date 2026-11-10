import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Management code ends sessions through next/headers, which only exists inside a request.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

import { verifyPin } from '@/server/crypto';
import { closeDb, db } from '@/server/db';
import { listCustomers } from '@/server/domain/admin-customers';
import { createOffer, deleteOffer, listAdminOffers, setOfferStatus, updateOffer } from '@/server/domain/admin-offers';
import { saveProgram } from '@/server/domain/admin-program';
import { createCampaign, processCampaign, processDueCampaigns } from '@/server/domain/admin-sms';
import { createStaff, ensureOwner, listStaff, resetStaffPin, updateStaff } from '@/server/domain/admin-staff';
import { dashboardFor } from '@/server/domain/dashboard';
import { createCustomer, eraseCustomer } from '@/server/domain/customers';
import { verifyLedger } from '@/server/domain/invariants';
import { listLiveOffers } from '@/server/domain/offers';
import { getProgram, toProgramDto } from '@/server/domain/program';
import { adjustStamps, addStampsAtCounter } from '@/server/domain/stamps';
import { isWeakPin } from '@/lib/domain/pin';
import type { OfferSave, ProgramSave, SmsCampaignCreate } from '@/lib/contracts/schemas';
import { actorOf, cardOf, makeBranch, makeCustomer, makeStaff, resetProgram, uniquePhone } from './helpers';

let branch: Awaited<ReturnType<typeof makeBranch>>;
let owner: Awaited<ReturnType<typeof makeStaff>>;
let manager: Awaited<ReturnType<typeof makeStaff>>;
const ctx = () => ({ requestId: randomUUID(), actor: { type: 'STAFF' as const, id: owner.id } });
const DAY = 86_400_000;
/** Letters only, so a search for it cannot accidentally match digits inside somebody's phone number. */
const letters = () => Array.from({ length: 8 }, () => 'abcdefghijklmnop'[randomInt(16)]).join('');

beforeAll(async () => {
  branch = await makeBranch('Admin');
  owner = await makeStaff('OWNER', [], { pin: '482913' });
  manager = await makeStaff('MANAGER', [branch.id], { pin: '735918' });
});
afterEach(resetProgram);
afterAll(async () => {
  expect(await verifyLedger(db())).toEqual([]);
  await closeDb();
});

/** A customer with exactly `stamps` stamps on the open card. */
async function customerWith(stamps: number, name?: string) {
  const c = await makeCustomer({ name });
  if (stamps !== 1) await adjustStamps({ customerId: c.id, delta: stamps - 1, reason: 'test setup', actor: actorOf(manager, null), ctx: ctx() });
  return c;
}

async function programSave(patch: Partial<ProgramSave> = {}): Promise<ProgramSave> {
  const p = toProgramDto(await getProgram(db()));
  return { name: p.name, total: p.total, items: p.items, minPurchase: p.minPurchase, dailyLimit: p.dailyLimit as 0, expiryDays: p.expiryDays as 0, welcome: p.welcome, color: p.color, version: p.version, ...patch };
}

describe('saving the loyalty program (MG-08, MG-09, BR-12 to BR-15)', () => {
  it('lowering the stamps per card completes the cards that already hold enough, one voucher each', async () => {
    const low = await customerWith(3);
    const exact = await customerWith(6);
    const high = await customerWith(9);

    const result = await saveProgram({ patch: await programSave({ total: 6 }), ctx: ctx() });
    expect(result.program.total).toBe(6);
    expect(result.completed.cards).toBeGreaterThanOrEqual(2);

    expect(await cardOf(low.id)).toMatchObject({ stamps: 3, rewardsEarned: 0 }); // not enough stamps: nothing changes
    expect(await cardOf(exact.id)).toMatchObject({ stamps: 0, rewardsEarned: 1 });
    expect(await cardOf(high.id)).toMatchObject({ stamps: 3, rewardsEarned: 1 }); // 9 stamps = one card of 6 + 3 over

    const [v] = await db().voucher.findMany({ where: { customerId: exact.id } });
    expect(v).toMatchObject({ source: 'CARD', stampsConsumed: 6, triggerEntryId: null });
    expect(await db().notification.count({ where: { customerId: high.id, kind: 'REWARD_UNLOCKED' } })).toBe(1);
    expect(await verifyLedger(db())).toEqual([]); // every counter still matches the ledger
  });

  it('raising the stamps per card changes nobody (BR-13)', async () => {
    const c = await customerWith(7);
    await saveProgram({ patch: await programSave({ total: 12 }), ctx: ctx() });
    expect(await cardOf(c.id)).toMatchObject({ stamps: 7, rewardsEarned: 0 });
  });

  it('can complete several cards for one customer', async () => {
    const c = await customerWith(9);
    await saveProgram({ patch: await programSave({ total: 4 }), ctx: ctx() });
    expect(await cardOf(c.id)).toMatchObject({ stamps: 1, rewardsEarned: 2 }); // 9 = 4 + 4 + 1
    expect(await db().voucher.count({ where: { customerId: c.id } })).toBe(2);
  });

  it('gives new vouchers the new reward items, and leaves old ones alone (BR-14)', async () => {
    const c = await customerWith(6);
    const old = await db().voucher.count({ where: { customerId: c.id } });
    await saveProgram({ patch: await programSave({ total: 6, items: ['sundae'] }), ctx: ctx() });
    const v = await db().voucher.findFirstOrThrow({ where: { customerId: c.id }, orderBy: { issuedAt: 'desc' } });
    expect(old).toBe(0);
    expect(v.titleEn).toBe('Free sundae');
    expect((v.choices as { id: string }[]).map((x) => x.id)).toEqual(['sundae']);
  });

  it('refuses a save from a stale screen, and says what the current program is', async () => {
    const stale = await programSave();
    await saveProgram({ patch: { ...stale, name: { bn: 'নতুন', en: 'Renamed' } }, ctx: ctx() });
    await expect(saveProgram({ patch: { ...stale, minPurchase: 999 }, ctx: ctx() })).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409, details: { current: { name: { en: 'Renamed' } } } });
  });

  it('lets only one of two simultaneous saves through', async () => {
    const base = await programSave();
    const results = await Promise.allSettled([saveProgram({ patch: { ...base, minPurchase: 300 }, ctx: ctx() }), saveProgram({ patch: { ...base, minPurchase: 400 }, ctx: ctx() })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('keeps the ledger consistent when stamps arrive while the program is being saved', async () => {
    const cashier = await makeStaff('CASHIER', [branch.id]);
    const customers = await Promise.all([customerWith(5), customerWith(5), customerWith(5)]);
    const base = await programSave({ total: 6 });
    const stamping = customers.map((c) => addStampsAtCounter({ customerId: c.id, count: 1, idempotencyKey: randomUUID(), actor: actorOf(cashier, branch.id), at: new Date() }));
    await Promise.all([saveProgram({ patch: base, ctx: ctx() }), ...stamping]);
    expect(await verifyLedger(db())).toEqual([]);
  });

  it('records who changed what in the audit log', async () => {
    const before = toProgramDto(await getProgram(db()));
    await saveProgram({ patch: await programSave({ minPurchase: before.minPurchase + 50 }), ctx: ctx() });
    const row = await db().auditLog.findFirstOrThrow({ where: { action: 'program.update' }, orderBy: { at: 'desc' } });
    expect(row).toMatchObject({ entityType: 'Program', actorId: owner.id });
    expect(row.before).toMatchObject({ minPurchase: before.minPurchase });
    expect(row.after).toMatchObject({ minPurchase: before.minPurchase + 50 });
  });

  it('turns the birthday and double-stamp offers on or off with the program (MG-10)', async () => {
    const birthday = await db().offer.create({ data: { kind: 'BIRTHDAY', badgeBn: 'জ', badgeEn: 'BDAY', titleBn: 'জন্মদিন', titleEn: 'Birthday', bodyBn: 'ক', bodyEn: 'b', bg: '#FF8A9A', fg: '#171717' } });
    const r = await saveProgram({ patch: await programSave({ birthdayOn: false }), ctx: ctx() });
    expect(r.birthdayOn).toBe(false);
    expect((await db().offer.findUniqueOrThrow({ where: { id: birthday.id } })).status).toBe('PAUSED');
    const back = await saveProgram({ patch: await programSave({ birthdayOn: true }), ctx: ctx() });
    expect(back.birthdayOn).toBe(true);
  });

  it('refuses reward items and colours that do not exist', async () => {
    await expect(saveProgram({ patch: await programSave({ items: ['pizza'] }), ctx: ctx() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(saveProgram({ patch: await programSave({ color: 'purple' }), ctx: ctx() })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('offers (MG-12, MG-13, BR-19)', () => {
  const data = (over: Partial<OfferSave> = {}): OfferSave => ({
    kind: 'stamp',
    badge: { bn: '+২', en: '+2' },
    title: { bn: 'পরীক্ষা', en: 'Admin test offer' },
    body: { bn: 'বিবরণ', en: 'Body' },
    terms: [{ bn: 'শর্ত', en: 'A term' }],
    bonusStamps: 2,
    bg: '#97C334',
    fg: '#171717',
    runDays: 5,
    ...over,
  });

  it('publishes, edits, pauses, resumes and deletes, and customers see each change at once', async () => {
    const now = Date.now();
    const created = await createOffer({ data: data(), ctx: ctx() });
    expect(created).toMatchObject({ status: 'live', kind: 'stamp', bonusStamps: 2, claims: 0 });
    expect(Date.parse(created.endsAt!) - now).toBeGreaterThan(4.9 * DAY);
    expect((await listLiveOffers(db(), new Date())).map((o) => o.id)).toContain(created.id);

    const edited = await updateOffer({ id: created.id, data: data({ title: { bn: 'নতুন', en: 'Renamed offer' }, bonusStamps: 1, runDays: 10 }), ctx: ctx() });
    expect(edited).toMatchObject({ title: { en: 'Renamed offer' }, bonusStamps: 1 });
    expect(Date.parse(edited.endsAt!) - now).toBeGreaterThan(9.9 * DAY);

    expect((await setOfferStatus({ id: created.id, status: 'paused', ctx: ctx() })).status).toBe('paused');
    expect((await listLiveOffers(db(), new Date())).map((o) => o.id)).not.toContain(created.id);
    expect((await listAdminOffers(db())).map((o) => o.id)).toContain(created.id); // management still sees it
    await setOfferStatus({ id: created.id, status: 'live', ctx: ctx() });
    expect((await listLiveOffers(db(), new Date())).map((o) => o.id)).toContain(created.id);

    await deleteOffer({ id: created.id, ctx: ctx() });
    expect((await listAdminOffers(db())).map((o) => o.id)).not.toContain(created.id);
    expect((await listLiveOffers(db(), new Date())).map((o) => o.id)).not.toContain(created.id);
    expect(await db().offer.count({ where: { id: created.id } })).toBe(1); // kept for claims and vouchers

    const actions = (await db().auditLog.findMany({ where: { entityType: 'Offer', entityId: created.id }, orderBy: { at: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['offer.create', 'offer.update', 'offer.pause', 'offer.resume', 'offer.delete']);
  });

  it('makes a free-item offer with its voucher name and days, and a birthday offer with no end date', async () => {
    const free = await createOffer({ data: data({ kind: 'voucher', bonusStamps: undefined, reward: { bn: 'ফ্রি টপিং', en: 'Free topping' }, voucherDays: 7 }), ctx: ctx() });
    expect(free).toMatchObject({ kind: 'voucher', reward: { en: 'Free topping' }, voucherDays: 7, bonusStamps: null });
    const bday = await createOffer({ data: data({ kind: 'birthday', bonusStamps: undefined, runDays: undefined }), ctx: ctx() });
    expect(bday.endsAt).toBeNull();
  });

  it('counts claims', async () => {
    const offer = await createOffer({ data: data(), ctx: ctx() });
    const c = await makeCustomer();
    await db().offerClaim.create({ data: { offerId: offer.id, customerId: c.id } });
    expect((await listAdminOffers(db())).find((o) => o.id === offer.id)?.claims).toBe(1);
  });

  it('cannot edit or pause an offer that was deleted', async () => {
    const offer = await createOffer({ data: data(), ctx: ctx() });
    await deleteOffer({ id: offer.id, ctx: ctx() });
    await expect(updateOffer({ id: offer.id, data: data(), ctx: ctx() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(setOfferStatus({ id: offer.id, status: 'paused', ctx: ctx() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('counts live offers on the dashboard the way customers see them: a paused offer and one past its end are not live', async () => {
    const before = (await dashboardFor(db(), { branchIds: null, now: new Date() })).offers;
    await createOffer({ data: data(), ctx: ctx() });
    // Published three days ago for one day: over for two days, although nobody paused it.
    await createOffer({ data: data({ runDays: 1 }), ctx: ctx(), at: new Date(Date.now() - 3 * DAY) });
    const paused = await createOffer({ data: data(), ctx: ctx() });
    await setOfferStatus({ id: paused.id, status: 'paused', ctx: ctx() });

    const after = (await dashboardFor(db(), { branchIds: null, now: new Date() })).offers;
    expect(after.live - before.live).toBe(1);
    expect(after.paused - before.paused).toBe(1);
  });
});

describe('staff accounts (MG-17)', () => {
  it('makes a cashier with a first PIN that is shown once and stored only as a hash', async () => {
    const made = await createStaff({ data: { name: 'New Cashier', phone: uniquePhone(), role: 'cashier', branchIds: [branch.id] }, ctx: ctx() });
    expect(made.temporaryPin).toMatch(/^\d{6}$/);
    expect(isWeakPin(made.temporaryPin)).toBe(false);
    expect(made.staff).toMatchObject({ role: 'cashier', active: true, branches: [{ id: branch.id }] });
    const row = await db().staff.findUniqueOrThrow({ where: { id: made.staff.id } });
    expect(row.pinHash).not.toContain(made.temporaryPin);
    expect(await verifyPin(made.temporaryPin, row.pinHash)).toBe(true);
    expect(JSON.stringify(await db().auditLog.findFirstOrThrow({ where: { action: 'staff.create', entityId: made.staff.id } }))).not.toContain(made.temporaryPin);
  });

  it('gives a cashier exactly one outlet, refuses unknown outlets and a number that is taken', async () => {
    const other = await makeBranch('Other');
    const phone = uniquePhone();
    await expect(createStaff({ data: { name: 'Two outlets', phone, role: 'cashier', branchIds: [branch.id, other.id] }, ctx: ctx() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(createStaff({ data: { name: 'Nowhere', phone, role: 'manager', branchIds: [randomUUID()] }, ctx: ctx() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await createStaff({ data: { name: 'Manager', phone, role: 'manager', branchIds: [branch.id, other.id] }, ctx: ctx() });
    await expect(createStaff({ data: { name: 'Same number', phone, role: 'cashier', branchIds: [branch.id] }, ctx: ctx() })).rejects.toMatchObject({ code: 'PHONE_TAKEN' });
  });

  it('signs a person out at once when their account is switched off or their role changes', async () => {
    const made = await createStaff({ data: { name: 'Leaver', phone: uniquePhone(), role: 'cashier', branchIds: [branch.id] }, ctx: ctx() });
    const live = () => db().session.create({ data: { tokenHash: randomUUID(), staffId: made.staff.id, expiresAt: new Date(Date.now() + DAY) } });
    const s1 = await live();
    await updateStaff({ id: made.staff.id, data: { active: false }, ctx: ctx(), actingStaffId: owner.id });
    expect((await db().session.findUniqueOrThrow({ where: { id: s1.id } })).revokedAt).not.toBeNull();
    expect((await db().staff.findUniqueOrThrow({ where: { id: made.staff.id } })).active).toBe(false);

    const s2 = await live();
    await updateStaff({ id: made.staff.id, data: { active: true, role: 'manager', branchIds: [branch.id] }, ctx: ctx(), actingStaffId: owner.id });
    expect((await db().session.findUniqueOrThrow({ where: { id: s2.id } })).revokedAt).not.toBeNull();
  });

  it('never edits an owner, and nobody can switch themselves off or change their own role', async () => {
    await expect(updateStaff({ id: owner.id, data: { name: 'Hijack' }, ctx: ctx(), actingStaffId: manager.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateStaff({ id: manager.id, data: { active: false }, ctx: ctx(), actingStaffId: manager.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateStaff({ id: manager.id, data: { role: 'cashier' }, ctx: ctx(), actingStaffId: manager.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateStaff({ id: randomUUID(), data: { name: 'Nobody' }, ctx: ctx(), actingStaffId: owner.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('resets a forgotten PIN: a new one, the lockout cleared and every session ended', async () => {
    const made = await createStaff({ data: { name: 'Forgetful', phone: uniquePhone(), role: 'cashier', branchIds: [branch.id] }, ctx: ctx() });
    await db().staff.update({ where: { id: made.staff.id }, data: { failedPinAttempts: 3, lockedUntil: new Date(Date.now() + 600_000) } });
    const s = await db().session.create({ data: { tokenHash: randomUUID(), staffId: made.staff.id, expiresAt: new Date(Date.now() + DAY) } });
    const reset = await resetStaffPin({ id: made.staff.id, ctx: ctx(), actingStaffId: owner.id });
    expect(reset.temporaryPin).not.toBe(made.temporaryPin);
    const row = await db().staff.findUniqueOrThrow({ where: { id: made.staff.id } });
    expect(row).toMatchObject({ failedPinAttempts: 0, lockedUntil: null });
    expect(await verifyPin(reset.temporaryPin, row.pinHash)).toBe(true);
    expect(await verifyPin(made.temporaryPin, row.pinHash)).toBe(false);
    expect((await db().session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull();
  });
});

describe('stamps given today on a staff row', () => {
  it('is the same on the list and on the rows that editing and resetting a PIN return', async () => {
    const cashier = await makeStaff('CASHIER', [branch.id]);
    const customer = await makeCustomer();
    await addStampsAtCounter({ customerId: customer.id, count: 2, idempotencyKey: randomUUID(), actor: actorOf(cashier, branch.id) });

    const listed = (await listStaff(db(), new Date())).find((s) => s.id === cashier.id);
    const updated = await updateStaff({ id: cashier.id, data: { name: 'Renamed Cashier' }, ctx: ctx(), actingStaffId: owner.id });
    const reset = await resetStaffPin({ id: cashier.id, ctx: ctx(), actingStaffId: owner.id });
    expect([listed?.stampsToday, updated.stampsToday, reset.staff.stampsToday]).toEqual([2, 2, 2]);
  });
});

describe('the first owner (setup script)', () => {
  it('creates an owner with a PIN shown once and a record of who made it', async () => {
    const phone = uniquePhone();
    const made = await ensureOwner({ phone, name: '  Test   Owner ' });
    expect(made).toMatchObject({ created: true, name: 'Test Owner' });
    expect(made.pin).toMatch(/^\d{6}$/);
    expect(isWeakPin(made.pin)).toBe(false);
    const row = await db().staff.findUniqueOrThrow({ where: { phone }, include: { branches: true } });
    expect(row).toMatchObject({ role: 'OWNER', active: true, branches: [] });
    expect(row.pinHash).not.toContain(made.pin);
    expect(await verifyPin(made.pin, row.pinHash)).toBe(true);
    const audit = await db().auditLog.findFirstOrThrow({ where: { action: 'staff.create', entityId: row.id } });
    expect(audit).toMatchObject({ actorType: 'SYSTEM', actorId: null });
    expect(JSON.stringify(audit)).not.toContain(made.pin);
  });

  it('refuses a missing name, an owner that exists already (unless asked for a new PIN) and anyone who is not an owner', async () => {
    const phone = uniquePhone();
    await expect(ensureOwner({ phone, name: 'x' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(ensureOwner({ phone })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await db().staff.count({ where: { phone } })).toBe(0);

    await ensureOwner({ phone, name: 'Real Owner' });
    await expect(ensureOwner({ phone, name: 'Real Owner' })).rejects.toMatchObject({ code: 'PHONE_TAKEN' });
    await expect(ensureOwner({ phone: manager.phone, name: 'Promoted', resetPin: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await db().staff.findUniqueOrThrow({ where: { id: manager.id } })).role).toBe('MANAGER');
  });

  it('gives an owner who forgot the PIN a new one, clears the lockout and signs them out everywhere', async () => {
    const phone = uniquePhone();
    const made = await ensureOwner({ phone, name: 'Forgetful Owner' });
    const row = await db().staff.findUniqueOrThrow({ where: { phone } });
    await db().staff.update({ where: { id: row.id }, data: { failedPinAttempts: 4, lockedUntil: new Date(Date.now() + 600_000), active: false } });
    const s = await db().session.create({ data: { tokenHash: randomUUID(), staffId: row.id, expiresAt: new Date(Date.now() + DAY) } });

    const again = await ensureOwner({ phone, resetPin: true });
    expect(again).toMatchObject({ created: false, name: 'Forgetful Owner' });
    const after = await db().staff.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ failedPinAttempts: 0, lockedUntil: null, active: true });
    expect(await verifyPin(again.pin, after.pinHash)).toBe(true);
    expect(await verifyPin(made.pin, after.pinHash)).toBe(false);
    expect((await db().session.findUniqueOrThrow({ where: { id: s.id } })).revokedAt).not.toBeNull();
    expect(await db().auditLog.count({ where: { action: 'staff.reset_pin', entityId: row.id, actorType: 'SYSTEM' } })).toBe(1);
  });
});

describe('customer groups (section 15, MG-04)', () => {
  it('puts every customer in exactly one of Active, Reward ready and Not seen in 30 days', async () => {
    const token = letters();
    const now = new Date();
    const fresh = await makeCustomer({ name: `${token} fresh` }); // joined just now, no visit yet: counts from joining
    const old = await makeCustomer({ name: `${token} old`, at: new Date(now.getTime() - 60 * DAY) }); // joined 60 days ago, never came
    const lapsed = await makeCustomer({ name: `${token} lapsed`, at: new Date(now.getTime() - 90 * DAY) });
    await db().card.update({ where: { customerId: lapsed.id }, data: { lastVisitAt: new Date(now.getTime() - 45 * DAY) } });
    const regular = await makeCustomer({ name: `${token} regular`, at: new Date(now.getTime() - 90 * DAY) });
    await db().card.update({ where: { customerId: regular.id }, data: { lastVisitAt: new Date(now.getTime() - 5 * DAY) } });
    // A customer whose card was filled by a manager adjustment, so a real voucher (and a consistent ledger) exists.
    const ready = await makeCustomer({ name: `${token} ready`, at: new Date(now.getTime() - 90 * DAY) });
    await adjustStamps({ customerId: ready.id, delta: 9, reason: 'fill the card', actor: actorOf(manager, null), ctx: ctx() });

    const names = async (segment: 'all' | 'active' | 'ready' | 'inactive') =>
      (await listCustomers(db(), { query: { segment, q: token, sort: 'name', page: 1, pageSize: 50 }, role: 'OWNER', now })).items.map((i) => i.name?.replace(`${token} `, ''));

    expect(await names('all')).toEqual(['fresh', 'lapsed', 'old', 'ready', 'regular']);
    expect(await names('active')).toEqual(['fresh', 'regular']);
    expect(await names('ready')).toEqual(['ready']);
    expect(await names('inactive')).toEqual(['lapsed', 'old']);

    const { counts } = await listCustomers(db(), { query: { segment: 'all', sort: 'recent', page: 1, pageSize: 5 }, role: 'OWNER', now });
    expect(counts.all).toBe(counts.active + counts.ready + counts.inactive);
    void fresh;
  });

  it('shows a cashier only a masked phone number, and management the whole number', async () => {
    const c = await makeCustomer({ name: `mask ${letters()}` });
    const asCashier = await listCustomers(db(), { query: { segment: 'all', q: c.name!, sort: 'recent', page: 1, pageSize: 5 }, role: 'CASHIER', now: new Date() });
    const asManager = await listCustomers(db(), { query: { segment: 'all', q: c.name!, sort: 'recent', page: 1, pageSize: 5 }, role: 'MANAGER', now: new Date() });
    expect(asCashier.items[0].phone).toMatch(/^\+880 1\dXX-XXX\d{3}$/);
    expect(asManager.items[0].phone).toBe(c.phone);
  });

  it('pages the list', async () => {
    const token = letters();
    for (let i = 0; i < 6; i++) await makeCustomer({ name: `${token} p${'abcdef'[i]}` });
    const page = (n: number) => listCustomers(db(), { query: { segment: 'all', q: token, sort: 'name', page: n, pageSize: 5 }, role: 'OWNER', now: new Date() });
    const [one, two] = await Promise.all([page(1), page(2)]);
    expect(one.total).toBe(6);
    expect(one.items).toHaveLength(5);
    expect(two.items).toHaveLength(1);
    expect(new Set([...one.items, ...two.items].map((i) => i.id)).size).toBe(6);
  });
});

describe('deleting a customer on request (BR-25, NF-08)', () => {
  it('wipes their details, ends their sessions and keeps the ledger, and the number can join again', async () => {
    const c = await customerWith(4, 'Erase Me');
    await db().customer.update({ where: { id: c.id }, data: { birthday: new Date('1990-05-05'), smsConsent: true, internalNote: 'private' } });
    const session = await db().session.create({ data: { tokenHash: randomUUID(), customerId: c.id, expiresAt: new Date(Date.now() + DAY) } });
    const entries = await db().stampEntry.count({ where: { customerId: c.id } });

    await db().$transaction((tx) => eraseCustomer(tx, c.id, { requestId: randomUUID(), actor: { type: 'CUSTOMER', id: c.id } }));

    const row = await db().customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ name: null, birthday: null, internalNote: null, smsConsent: false });
    expect(row.deletedAt).not.toBeNull();
    expect(row.phone).not.toBe(c.phone);
    expect(await db().stampEntry.count({ where: { customerId: c.id } })).toBe(entries);
    expect((await db().session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    expect(await db().auditLog.count({ where: { action: 'customer.erase', entityId: c.id } })).toBe(1);

    const again = await db().$transaction((tx) => createCustomer(tx, { phone: c.phone, name: 'Fresh start', joinedVia: 'APP' }));
    expect(again.customer.id).not.toBe(c.id);
    await expect(db().$transaction((tx) => eraseCustomer(tx, c.id, { actor: { type: 'CUSTOMER', id: c.id } }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('SMS campaigns (MG-15, BR-22 to BR-24)', () => {
  const setBalance = (n: number) => db().setting.upsert({ where: { key: 'sms.balance' }, create: { key: 'sms.balance', value: n }, update: { value: n } });
  const balance = async () => Number((await db().setting.findUniqueOrThrow({ where: { key: 'sms.balance' } })).value);
  const campaign = (over: Partial<SmsCampaignCreate> = {}): SmsCampaignCreate => ({ name: 'Test campaign', audience: 'all', message: 'ChaJoy: Double stamps this Friday!', ...over });
  let consenting: string[] = [];

  beforeAll(async () => {
    // Only these two customers have agreed to offer SMS in the whole test schema.
    const a = await makeCustomer();
    const b = await makeCustomer();
    await makeCustomer(); // has not agreed
    await db().customer.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { smsConsent: true } });
    consenting = [a.id, b.id];
  });

  it('messages only customers who agreed, counts the SMS parts and takes them off the balance', async () => {
    await setBalance(100);
    const result = await createCampaign({ data: campaign(), ctx: ctx() });
    expect(result).toMatchObject({ status: 'sent', recipients: consenting.length, parts: 1, smsNeeded: consenting.length, sent: consenting.length, failed: 0, unicode: false });
    expect(await balance()).toBe(100 - consenting.length);
    const messaged = (await db().smsMessage.findMany({ where: { campaignId: result.id } })).map((m) => m.customerId).sort();
    expect(messaged).toEqual([...consenting].sort());
  });

  it('counts a Bangla message as Unicode with more parts, so it needs more SMS (BR-23)', async () => {
    await setBalance(1000);
    const result = await createCampaign({ data: campaign({ message: 'চা জয়: এই শুক্রবার প্রতিটি বাবল টি-তে ডাবল Stamp! আপনার কার্ড দেখুন, মজা করে খান আর ভিজিট করুন আমাদের যেকোনো আউটলেটে' }), ctx: ctx() });
    expect(result.unicode).toBe(true);
    expect(result.parts).toBeGreaterThan(1);
    expect(result.smsNeeded).toBe(result.recipients * result.parts);
    expect(await balance()).toBe(1000 - result.smsNeeded);
  });

  it('refuses a campaign when the balance is too low, and sends nothing (BR-24)', async () => {
    await setBalance(1);
    const before = await db().smsCampaign.count();
    await expect(createCampaign({ data: campaign(), ctx: ctx() })).rejects.toMatchObject({ code: 'SMS_BALANCE_LOW', status: 409, details: { balance: 1, needed: consenting.length } });
    expect(await db().smsCampaign.count()).toBe(before);
    expect(await balance()).toBe(1);
  });

  it('refuses a group with nobody in it', async () => {
    await setBalance(100);
    await expect(createCampaign({ data: campaign({ audience: 'birthday-week' }), ctx: ctx() })).rejects.toMatchObject({ code: 'NO_RECIPIENTS' });
  });

  it('never sends a message twice, even when the campaign is processed again', async () => {
    await setBalance(100);
    const result = await createCampaign({ data: campaign(), ctx: ctx() });
    const left = await balance();
    const again = await processCampaign(result.id);
    expect(again.sent).toBe(result.sent);
    expect(await balance()).toBe(left);
    expect(await db().smsMessage.count({ where: { campaignId: result.id, status: 'SENT' } })).toBe(consenting.length);
  });

  it('holds a scheduled campaign until its time comes', async () => {
    await setBalance(100);
    const at = new Date(Date.now() + 3_600_000);
    const queued = await createCampaign({ data: campaign({ scheduledAt: at.toISOString() }), ctx: ctx() });
    expect(queued).toMatchObject({ status: 'scheduled', sent: 0 });
    expect(await balance()).toBe(100);
    await expect(createCampaign({ data: campaign({ scheduledAt: new Date(Date.now() - 1000).toISOString() }), ctx: ctx() })).rejects.toMatchObject({ code: 'VALIDATION' });

    await processDueCampaigns(new Date(at.getTime() - 1000));
    expect((await db().smsCampaign.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('SCHEDULED');
    await processDueCampaigns(new Date(at.getTime() + 1000));
    expect((await db().smsCampaign.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('SENT');
    expect(await balance()).toBe(100 - consenting.length);
  });
});
