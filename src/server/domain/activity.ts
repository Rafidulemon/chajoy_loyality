import 'server-only';
import type { Tx } from '../db';
import { dhakaDateColumn, dhakaDayEnd, dhakaDayStart } from '@/lib/domain/time';
import type { ActivityDto, FeedItemDto, TextPair } from '@/lib/contracts/dto';

/**
 * Timelines are built from the ledger and the vouchers when they are asked for, never stored a second time, so they can
 * never disagree with the cards. A stamp, an undo, an adjustment, a welcome or offer stamp comes from StampEntry; a reward
 * unlocked and a reward given come from Voucher; joining comes from Customer.
 */

const pair = (bn: string, en: string): TextPair => ({ bn, en });

type Audience = 'customer' | 'staff';

/** Newest first. At the same moment the reward goes above the stamp that earned it, the way the customer sees it. */
const RANK: Record<ActivityDto['kind'], number> = {
  'reward-redeemed': 0,
  'reward-unlocked': 1,
  stamp: 2,
  undo: 2,
  adjust: 2,
  'offer-bonus': 2,
  welcome: 3,
  joined: 4,
};

const byNewest = (a: ActivityDto, b: ActivityDto) => (a.at === b.at ? RANK[a.kind] - RANK[b.kind] : a.at < b.at ? 1 : -1);

function stampKind(e: { source: string; count: number }): ActivityDto['kind'] {
  switch (e.source) {
    case 'WELCOME':
      return 'welcome';
    case 'OFFER':
      return 'offer-bonus';
    case 'ADJUSTMENT':
      return 'adjust';
    default:
      return e.count < 0 ? 'undo' : 'stamp';
  }
}

/**
 * One customer's timeline, newest first, paged by time. `before` is inclusive and the page can repeat the boundary row, so the
 * app drops rows whose id it already has. Customers do not see which staff member acted or the manager's reason (privacy); staff do.
 */
export async function customerActivity(tx: Tx, input: { customerId: string; before?: Date; limit: number; audience: Audience }): Promise<{ items: ActivityDto[]; nextBefore: string | null }> {
  const { customerId, before, limit, audience } = input;
  const staff = audience === 'staff';

  const [entries, unlocked, redeemed, customer] = await Promise.all([
    tx.stampEntry.findMany({
      where: { customerId, ...(before ? { createdAt: { lte: before } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { branch: { select: { nameBn: true, nameEn: true } }, staff: { select: { name: true } }, offer: { select: { titleBn: true, titleEn: true } } },
    }),
    tx.voucher.findMany({ where: { customerId, ...(before ? { issuedAt: { lte: before } } : {}) }, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], take: limit }),
    tx.voucher.findMany({
      where: { customerId, redeemedAt: before ? { not: null, lte: before } : { not: null } },
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { redeemedBranch: { select: { nameBn: true, nameEn: true } }, redeemedBy: { select: { name: true } } },
    }),
    tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true, joinedAt: true } }),
  ]);

  const items: ActivityDto[] = [];
  for (const e of entries) {
    items.push({
      id: `stamp:${e.id}`,
      at: e.createdAt.toISOString(),
      kind: stampKind(e),
      count: e.count,
      title: e.offer ? pair(e.offer.titleBn, e.offer.titleEn) : null,
      reason: staff ? e.reason : null,
      branch: e.branch ? pair(e.branch.nameBn, e.branch.nameEn) : null,
      staffName: staff ? (e.staff?.name ?? null) : null,
    });
  }
  for (const v of unlocked) {
    items.push({ id: `unlock:${v.id}`, at: v.issuedAt.toISOString(), kind: 'reward-unlocked', title: pair(v.titleBn, v.titleEn) });
  }
  for (const v of redeemed) {
    items.push({
      id: `redeem:${v.id}`,
      at: v.redeemedAt!.toISOString(),
      kind: 'reward-redeemed',
      title: pair(v.titleBn, v.titleEn),
      item: v.chosenItemBn && v.chosenItemEn ? pair(v.chosenItemBn, v.chosenItemEn) : null,
      branch: v.redeemedBranch ? pair(v.redeemedBranch.nameBn, v.redeemedBranch.nameEn) : null,
      staffName: staff ? (v.redeemedBy?.name ?? null) : null,
    });
  }
  if (!before || customer.joinedAt <= before) items.push({ id: `joined:${customer.id}`, at: customer.joinedAt.toISOString(), kind: 'joined' });

  items.sort(byNewest);
  const page = items.slice(0, limit);
  const more = items.length > limit || entries.length === limit || unlocked.length === limit || redeemed.length === limit;
  return { items: page, nextBefore: more && page.length ? page[page.length - 1].at : null };
}

/** What happened across all customers, for the cashier's Today list and management's recent activity. `branchIds` limits it to those outlets; null means all. */
export async function recentActivity(tx: Tx, input: { branchIds?: string[] | null; since?: Date; limit: number }): Promise<FeedItemDto[]> {
  const { branchIds, since, limit } = input;
  const inRange = since ? { gte: since } : undefined;

  const [entries, redeemed, joined] = await Promise.all([
    tx.stampEntry.findMany({
      where: { ...(branchIds ? { branchId: { in: branchIds } } : {}), ...(inRange ? { createdAt: inRange } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { customer: { select: { id: true, name: true } }, branch: { select: { nameBn: true, nameEn: true } }, staff: { select: { id: true, name: true } }, offer: { select: { titleBn: true, titleEn: true } } },
    }),
    tx.voucher.findMany({
      where: { redeemedAt: inRange ? { not: null, ...inRange } : { not: null }, ...(branchIds ? { redeemedAtId: { in: branchIds } } : {}) },
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { customer: { select: { id: true, name: true } }, redeemedBranch: { select: { nameBn: true, nameEn: true } }, redeemedBy: { select: { id: true, name: true } } },
    }),
    tx.customer.findMany({
      where: { deletedAt: null, ...(branchIds ? { joinedBranchId: { in: branchIds } } : {}), ...(inRange ? { joinedAt: inRange } : {}) },
      orderBy: { joinedAt: 'desc' },
      take: limit,
      select: { id: true, name: true, joinedAt: true, createdBy: { select: { id: true, name: true } }, joinedBranch: { select: { nameBn: true, nameEn: true } } },
    }),
  ]);

  const items: FeedItemDto[] = [];
  for (const e of entries) {
    // Welcome stamps are part of "joined", so the list shows one line for a new customer.
    if (e.source === 'WELCOME') continue;
    items.push({
      id: `stamp:${e.id}`,
      at: e.createdAt.toISOString(),
      kind: stampKind(e),
      count: e.count,
      title: e.offer ? pair(e.offer.titleBn, e.offer.titleEn) : null,
      reason: e.reason,
      branch: e.branch ? pair(e.branch.nameBn, e.branch.nameEn) : null,
      staffName: e.staff?.name ?? null,
      customer: { id: e.customer.id, name: e.customer.name },
      staff: e.staff ? { id: e.staff.id, name: e.staff.name } : null,
    });
    if (e.completedCards > 0) {
      items.push({
        id: `unlock-of:${e.id}`,
        at: e.createdAt.toISOString(),
        kind: 'reward-unlocked',
        branch: e.branch ? pair(e.branch.nameBn, e.branch.nameEn) : null,
        staffName: e.staff?.name ?? null,
        customer: { id: e.customer.id, name: e.customer.name },
        staff: e.staff ? { id: e.staff.id, name: e.staff.name } : null,
      });
    }
  }
  for (const v of redeemed) {
    items.push({
      id: `redeem:${v.id}`,
      at: v.redeemedAt!.toISOString(),
      kind: 'reward-redeemed',
      title: pair(v.titleBn, v.titleEn),
      item: v.chosenItemBn && v.chosenItemEn ? pair(v.chosenItemBn, v.chosenItemEn) : null,
      branch: v.redeemedBranch ? pair(v.redeemedBranch.nameBn, v.redeemedBranch.nameEn) : null,
      staffName: v.redeemedBy?.name ?? null,
      customer: { id: v.customer.id, name: v.customer.name },
      staff: v.redeemedBy ? { id: v.redeemedBy.id, name: v.redeemedBy.name } : null,
    });
  }
  for (const c of joined) {
    items.push({
      id: `joined:${c.id}`,
      at: c.joinedAt.toISOString(),
      kind: 'joined',
      branch: c.joinedBranch ? pair(c.joinedBranch.nameBn, c.joinedBranch.nameEn) : null,
      staffName: c.createdBy?.name ?? null,
      customer: { id: c.id, name: c.name },
      staff: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
    });
  }
  items.sort(byNewest);
  return items.slice(0, limit);
}

/**
 * The cashier's counters for a day at one outlet (CA-15): stamps given, rewards given, new customers, stamps cancelled.
 * "Stamps given" means purchase stamps minus none: a cancelled stamp is counted under cancelled, not subtracted.
 */
export async function dayCounters(tx: Tx, input: { branchId: string | null; at: Date }) {
  const start = dhakaDayStart(input.at);
  const end = dhakaDayEnd(input.at);
  const branch = input.branchId ? { branchId: input.branchId } : {};

  const [given, cancelled, rewards, newCustomers] = await Promise.all([
    tx.stampEntry.aggregate({ _sum: { count: true }, where: { source: 'PURCHASE', count: { gt: 0 }, createdAt: { gte: start, lt: end }, ...branch } }),
    tx.stampEntry.aggregate({ _sum: { count: true }, where: { source: 'PURCHASE', count: { lt: 0 }, createdAt: { gte: start, lt: end }, ...branch } }),
    tx.voucher.count({ where: { redeemedAt: { gte: start, lt: end }, ...(input.branchId ? { redeemedAtId: input.branchId } : {}) } }),
    tx.customer.count({ where: { deletedAt: null, joinedAt: { gte: start, lt: end }, ...(input.branchId ? { joinedBranchId: input.branchId } : {}) } }),
  ]);
  return {
    stamps: given._sum.count ?? 0,
    cancelled: Math.abs(cancelled._sum.count ?? 0),
    rewards,
    newCustomers,
    day: dhakaDateColumn(input.at),
  };
}
