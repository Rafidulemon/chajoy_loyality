import 'server-only';
import type { Tx } from '../db';
import { REWARD_ITEMS } from '@/lib/program';
import { DAY, dhakaDateColumn, dhakaDayKey, dhakaDayStart, dhakaDaysAgo } from '@/lib/domain/time';
import type { DashboardDto } from '@/lib/contracts/admin';
import { recentActivity } from './activity';
import { liveOfferWhere } from './offers';

/**
 * The management dashboard (MG-01, MG-02). All figures use the definitions in section 15 of the business documentation:
 * a visit is one customer at one outlet on one day, an active member has a visit in the last 30 days, and the return rate
 * is members with 2+ visits in 30 days divided by active members. "Days" are Dhaka calendar days.
 */
export async function dashboardFor(tx: Tx, input: { branchIds: string[] | null; now: Date }): Promise<DashboardDto> {
  const { branchIds, now } = input;
  const start30 = dhakaDaysAgo(now, 29);
  const prevStart = dhakaDaysAgo(now, 59);
  const weekStart = dhakaDaysAgo(now, 6);
  const dayOfMonthStart = new Date(`${dhakaDayKey(now).slice(0, 8)}01T00:00:00+06:00`);
  const branchFilter = branchIds ? { branchId: { in: branchIds } } : {};

  const [customers, newCustomers, stamps, stampsPrevious, redeemed, monthVisitors, weekVisits, popular, top, recent, balance, smsUsed, liveOffers, pausedOffers, claims] = await Promise.all([
    tx.customer.count({ where: { deletedAt: null } }),
    tx.customer.count({ where: { deletedAt: null, joinedAt: { gte: start30 } } }),
    tx.stampEntry.aggregate({ _sum: { count: true }, where: { createdAt: { gte: start30 }, ...branchFilter } }),
    tx.stampEntry.aggregate({ _sum: { count: true }, where: { createdAt: { gte: prevStart, lt: start30 }, ...branchFilter } }),
    tx.voucher.count({ where: { redeemedAt: { gte: start30 }, ...(branchIds ? { redeemedAtId: { in: branchIds } } : {}) } }),
    tx.visit.groupBy({ by: ['customerId'], where: { day: { gte: dhakaDateColumn(start30) }, ...branchFilter }, _count: { _all: true } }),
    tx.visit.groupBy({ by: ['day'], where: { day: { gte: dhakaDateColumn(weekStart) }, ...branchFilter }, _count: { _all: true } }),
    tx.voucher.groupBy({
      by: ['chosenItemId'],
      where: { redeemedAt: { gte: start30 }, chosenItemId: { not: null }, ...(branchIds ? { redeemedAtId: { in: branchIds } } : {}) },
      _count: { _all: true },
      orderBy: { _count: { chosenItemId: 'desc' } },
      take: 4,
    }),
    tx.card.findMany({ where: { customer: { deletedAt: null } }, orderBy: [{ visits: 'desc' }, { lifetimeStamps: 'desc' }], take: 3, select: { visits: true, customer: { select: { id: true, name: true } } } }),
    recentActivity(tx, { branchIds, since: dhakaDaysAgo(now, 29), limit: 8 }),
    tx.setting.findUnique({ where: { key: 'sms.balance' } }),
    tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(SUM(c."parts"), 0)::int AS n
      FROM "SmsMessage" m JOIN "SmsCampaign" c ON c."id" = m."campaignId"
      WHERE m."status" = 'SENT' AND m."sentAt" >= ${dayOfMonthStart}`,
    // "Live" means what customers see right now (BR-19): an offer past its end date is not live even if nobody paused it.
    tx.offer.count({ where: liveOfferWhere(now) }),
    tx.offer.count({ where: { status: 'PAUSED', deletedAt: null } }),
    tx.offerClaim.count(),
  ]);

  const visitsByDay = new Map(weekVisits.map((v) => [v.day.toISOString().slice(0, 10), v._count._all]));
  const weeklyVisits = Array.from({ length: 7 }, (_, i) => {
    const day = dhakaDayKey(new Date(dhakaDayStart(now).getTime() - (6 - i) * DAY + 12 * 3_600_000));
    return { day, visits: visitsByDay.get(day) ?? 0 };
  });

  const activeMembers = monthVisitors.length;
  const returning = monthVisitors.filter((v) => v._count._all >= 2).length;

  return {
    branchIds,
    totals: {
      customers,
      newCustomers,
      stamps: stamps._sum.count ?? 0,
      stampsPrevious: stampsPrevious._sum.count ?? 0,
      rewardsRedeemed: redeemed,
      activeMembers,
      returnRate: activeMembers === 0 ? 0 : returning / activeMembers,
    },
    weeklyVisits,
    popularRewards: popular.map((p) => {
      const item = REWARD_ITEMS.find((i) => i.id === p.chosenItemId);
      return { id: p.chosenItemId ?? '', name: item?.name ?? { bn: p.chosenItemId ?? '', en: p.chosenItemId ?? '' }, count: p._count._all };
    }),
    topCustomers: top.map((c) => ({ id: c.customer.id, name: c.customer.name, visits: c.visits })),
    recent,
    sms: { balance: typeof balance?.value === 'number' ? balance.value : 0, usedThisMonth: smsUsed[0]?.n ?? 0 },
    offers: { live: liveOffers, paused: pausedOffers, claims },
  };
}
