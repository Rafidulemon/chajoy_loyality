/**
 * Seeds the database.
 *
 *  1. Reference data, always: ChaJoy's ten outlets (names and addresses are real; coordinates and opening hours are
 *     placeholders until ChaJoy supplies them, decision D-06). The default program is created by a migration.
 *  2. Demo data, in development only: five staff, eight customers with a believable history, five offers and an SMS balance.
 *     It is built with the same functions the API uses (writeStamps, redeemVoucher, claimOffer), so every ledger row,
 *     counter and voucher obeys the real rules. Run `npm run db:seed` again any time: nothing is created twice.
 *
 * Demo phone numbers are +880 1700-0000NN for staff and +880 1700-000NNN for customers. In development nothing is ever sent
 * to them (the SMS provider is the console and OTP_MODE=fixed). Staff PINs come from SEED_STAFF_PIN in .env.local.
 *
 * Run with: npm run db:seed
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { closeDb, db, lockCard, type Tx } from '@/server/db';
import { env } from '@/server/env';
import { hashPin } from '@/server/crypto';
import { createCustomer } from '@/server/domain/customers';
import { writeStamps } from '@/server/domain/ledger';
import { claimOffer } from '@/server/domain/offers';
import { getProgram } from '@/server/domain/program';
import { redeemVoucher } from '@/server/domain/vouchers';
import { addDays, DAY } from '@/lib/domain/time';
import { branches as sampleBranches, offers as sampleOffers } from '@/lib/data';

const HOUR = 3_600_000;

async function seedBranches() {
  let order = 0;
  for (const b of sampleBranches) {
    const data = {
      nameBn: b.name.bn,
      nameEn: b.name.en,
      addressBn: b.address.bn,
      addressEn: b.address.en,
      latitude: b.lat,
      longitude: b.lng,
      isMain: b.main,
      chipColor: b.chip,
      sortOrder: order++,
    };
    // Created once and never overwritten: coordinates and hours are placeholders that ChaJoy corrects in Settings, and a
    // re-run of the seed must not undo that.
    await db().branch.upsert({ where: { slug: b.id }, create: { slug: b.id, openMinute: 11 * 60, closeMinute: 23 * 60, ...data }, update: {} });
  }
  console.log(`outlets: ${sampleBranches.length}`);
}

// ---------------------------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------------------------

const STAFF = [
  { phone: '+8801700000001', name: 'Rafiq', role: 'OWNER' as const, branches: [] as string[], active: true },
  { phone: '+8801700000002', name: 'Sohel', role: 'MANAGER' as const, branches: ['mohammadpur'], active: true },
  { phone: '+8801700000003', name: 'Rakib', role: 'CASHIER' as const, branches: ['mirpur-10'], active: true },
  { phone: '+8801700000004', name: 'Mitu', role: 'CASHIER' as const, branches: ['mirpur-10'], active: true },
  { phone: '+8801700000005', name: 'Jui', role: 'CASHIER' as const, branches: ['rampura'], active: false },
];

async function seedStaff() {
  const pin = process.env.SEED_STAFF_PIN;
  if (!pin || !/^\d{6}$/.test(pin)) throw new Error('Set SEED_STAFF_PIN (6 digits) in .env.local so the demo staff can sign in');
  const pinHash = await hashPin(pin);
  const slugToId = new Map((await db().branch.findMany({ select: { id: true, slug: true } })).map((b) => [b.slug, b.id]));
  for (const s of STAFF) {
    const existing = await db().staff.findUnique({ where: { phone: s.phone }, select: { id: true } });
    if (existing) continue;
    await db().staff.create({
      data: {
        phone: s.phone,
        name: s.name,
        role: s.role,
        active: s.active,
        pinHash,
        pinChangedAt: new Date(),
        branches: { create: s.branches.map((slug) => ({ branchId: slugToId.get(slug)! })) },
      },
    });
  }
  console.log(`staff: ${STAFF.length} (PIN from SEED_STAFF_PIN)`);
}

type CustomerSpec = {
  name: string;
  phone: string;
  language: 'EN' | 'BN';
  birthday?: string;
  smsConsent: boolean;
  home: string;
  /** How many days ago they joined. 0 = today, at the counter. */
  joined: number;
  /** Counter visits and the purchase stamps over them (at most 2 per visit, the program's daily limit). */
  visits: number;
  stamps: number;
  /** How many days ago the last visit was. */
  last: number;
};

const CUSTOMERS: CustomerSpec[] = [
  { name: 'Tanvir Ahmed', phone: '+8801700000101', language: 'EN', birthday: '1996-03-12', smsConsent: true, home: 'mirpur-10', joined: 190, visits: 23, stamps: 46, last: 2 },
  { name: 'Nusrat Jahan', phone: '+8801700000102', language: 'BN', smsConsent: true, home: 'mirpur-10', joined: 140, visits: 17, stamps: 29, last: 0 },
  { name: 'Sakib Hasan', phone: '+8801700000103', language: 'EN', smsConsent: false, home: 'mirpur-10', joined: 0, visits: 0, stamps: 0, last: 0 },
  { name: 'Farhana Islam', phone: '+8801700000104', language: 'BN', smsConsent: true, home: 'mohammadpur', joined: 160, visits: 17, stamps: 33, last: 5 },
  { name: 'Rashed Karim', phone: '+8801700000105', language: 'EN', smsConsent: true, home: 'mirpur-10', joined: 90, visits: 12, stamps: 19, last: 1 },
  { name: 'Mehedi Hasan', phone: '+8801700000106', language: 'EN', smsConsent: false, home: 'rampura', joined: 100, visits: 2, stamps: 2, last: 41 },
  { name: 'Tasnim Rahman', phone: '+8801700000107', language: 'BN', birthday: '1999-11-14', smsConsent: true, home: 'uttara-bns', joined: 80, visits: 9, stamps: 15, last: 3 },
  { name: 'Arif Chowdhury', phone: '+8801700000108', language: 'EN', smsConsent: true, home: 'badda', joined: 75, visits: 1, stamps: 1, last: 52 },
];

/** Spreads `stamps` over `visits`, at most 2 each, front-loading the extras. [2,2,1,1,1] for 5 visits and 7 stamps. */
function schedule(visits: number, stamps: number): number[] {
  if (visits === 0) return [];
  if (stamps > visits * 2 || stamps < visits) throw new Error(`cannot spread ${stamps} stamps over ${visits} visits`);
  const out = Array<number>(visits).fill(1);
  for (let extra = stamps - visits, i = 0; extra > 0; extra--, i++) out[i] += 1;
  return out;
}

/** 14:00 Dhaka time on the day `daysAgo` days before `now`, plus a few minutes so rows on one day are ordered. Never in the future. */
const dhakaAfternoon = (now: Date, daysAgo: number, minutes = 0) => {
  const d = new Date(now.getTime() - daysAgo * DAY);
  const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, minutes, 0));
  return at.getTime() > now.getTime() ? new Date(now.getTime() - (50 - Math.min(minutes, 45)) * 60_000) : at;
};

async function seedDemoCustomer(spec: CustomerSpec, now: Date, ids: { branch: Map<string, string>; cashier: Map<string, string[]> }) {
  if (await db().customer.findUnique({ where: { phone: spec.phone }, select: { id: true } })) return false;

  const homeId = ids.branch.get(spec.home)!;
  const otherIds = [...ids.branch.values()].filter((id) => id !== homeId);
  const cashiersAt = (branchId: string) => ids.cashier.get(branchId) ?? [];
  const joinedAt = dhakaAfternoon(now, spec.joined, 0);
  const atCounter = spec.joined === 0;
  const creatorId = cashiersAt(homeId)[0] ?? null;

  const customerId = await db().$transaction(
    async (tx: Tx) => {
      const program = await getProgram(tx);
      const created = await createCustomer(tx, {
        phone: spec.phone,
        name: spec.name,
        joinedVia: atCounter ? 'COUNTER' : 'APP',
        smsConsent: spec.smsConsent,
        language: spec.language,
        birthday: spec.birthday ? new Date(`${spec.birthday}T00:00:00.000Z`) : null,
        createdById: atCounter ? creatorId : null,
        branchId: atCounter ? homeId : null,
        at: joinedAt,
      });
      const customerId = created.customer.id;
      await lockCard(tx, customerId);

      const perVisit = schedule(spec.visits, spec.stamps);
      const firstDay = Math.max(spec.joined - 1, spec.last);
      for (let i = 0; i < perVisit.length; i++) {
        const daysAgo = perVisit.length === 1 ? spec.last : Math.round(firstDay - (i * (firstDay - spec.last)) / (perVisit.length - 1));
        const at = dhakaAfternoon(now, daysAgo, 5 + (i % 40));
        const branchId = i % 5 === 4 ? otherIds[i % otherIds.length] : homeId; // BR-05: stamps count at every outlet
        const staffId = cashiersAt(branchId)[i % Math.max(1, cashiersAt(branchId).length)] ?? creatorId;
        const card = await tx.card.findUniqueOrThrow({ where: { customerId } });
        await writeStamps(tx, { customerId, card, program, delta: perVisit[i], source: 'PURCHASE', at, branchId, staffId, visit: true });
      }
      return customerId;
    },
    { maxWait: 20_000, timeout: 180_000 },
  );

  // Rewards: redeem every second old voucher a few days after it was issued, keep the newest, and let any that were left
  // for more than 30 days lapse, so the Rewards screen has ready, used and expired vouchers to show.
  const vouchers = await db().voucher.findMany({ where: { customerId, source: 'CARD' }, orderBy: { issuedAt: 'asc' } });
  const cashier = cashiersAt(homeId)[0] ?? creatorId;
  for (let j = 0; j < vouchers.length - 1; j++) {
    if (j % 2 !== 0 || !cashier) continue;
    const v = vouchers[j];
    const at = new Date(v.issuedAt.getTime() + 5 * DAY);
    if (at.getTime() > now.getTime()) continue;
    const choices = Array.isArray(v.choices) ? (v.choices as { id: string }[]) : [];
    await redeemVoucher({ voucherId: v.id, itemId: choices[j % Math.max(1, choices.length)]?.id ?? null, actor: { id: cashier, role: 'CASHIER', branchId: homeId }, at });
  }
  return true;
}

async function seedOffers(now: Date) {
  if ((await db().offer.count()) > 0) return;
  for (const o of sampleOffers) {
    const kind = o.kind.toUpperCase() as 'DOUBLE' | 'STAMP' | 'VOUCHER' | 'INFO' | 'BIRTHDAY';
    await db().offer.create({
      data: {
        kind,
        status: 'LIVE',
        badgeBn: o.badge.bn,
        badgeEn: o.badge.en,
        titleBn: o.title.bn,
        titleEn: o.title.en,
        bodyBn: o.body.bn,
        bodyEn: o.body.en,
        terms: o.terms.map((t) => ({ bn: t.bn, en: t.en })),
        bonusStamps: o.bonusStamps ?? null,
        rewardBn: o.reward?.bn ?? null,
        rewardEn: o.reward?.en ?? null,
        voucherDays: o.voucherDays ?? null,
        bg: o.bg,
        fg: o.fg,
        startsAt: addDays(now, -10),
        endsAt: o.endsInDays === null ? null : addDays(now, o.endsInDays),
      },
    });
  }
  console.log(`offers: ${sampleOffers.length}`);
}

async function seedDemo() {
  if (env().NODE_ENV === 'production') throw new Error('Demo data is for development only and is refused in production');
  const now = new Date();
  await seedStaff();

  const branchRows = await db().branch.findMany({ select: { id: true, slug: true } });
  const staffRows = await db().staff.findMany({ where: { role: 'CASHIER', active: true }, select: { id: true, branches: { select: { branchId: true } } }, orderBy: { createdAt: 'asc' } });
  const ids = {
    branch: new Map(branchRows.map((b) => [b.slug, b.id])),
    cashier: new Map<string, string[]>(),
  };
  for (const s of staffRows) for (const b of s.branches) ids.cashier.set(b.branchId, [...(ids.cashier.get(b.branchId) ?? []), s.id]);

  await seedOffers(now);

  let made = 0;
  for (const spec of CUSTOMERS) {
    if (await seedDemoCustomer(spec, now, ids)) made += 1;
  }
  console.log(`demo customers: ${made} new, ${CUSTOMERS.length - made} already there`);

  // Tanvir claims the free-topping offer a few days ago, so his Rewards screen has an offer voucher.
  const tanvir = await db().customer.findUnique({ where: { phone: CUSTOMERS[0].phone }, select: { id: true } });
  const topping = await db().offer.findFirst({ where: { kind: 'VOUCHER', deletedAt: null } });
  if (tanvir && topping && !(await db().offerClaim.findUnique({ where: { offerId_customerId: { offerId: topping.id, customerId: tanvir.id } } }))) {
    await claimOffer({ customerId: tanvir.id, offerId: topping.id, at: addDays(now, -3) });
  }

  await db().setting.upsert({ where: { key: 'sms.balance' }, create: { key: 'sms.balance', value: 500 }, update: {} });
}

async function main() {
  await seedBranches();
  if (process.env.SEED_DEMO === '0') {
    console.log('demo data skipped (SEED_DEMO=0)');
  } else {
    await seedDemo();
  }
}

main()
  .then(() => closeDb())
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
