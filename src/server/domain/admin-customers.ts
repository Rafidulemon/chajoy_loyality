import 'server-only';
import type { Prisma, Tx } from '../db';
import { fail } from '../errors';
import type { StaffRole } from '@/lib/domain/permissions';
import { ACTIVE_WINDOW_DAYS } from '@/lib/domain/rules';
import { DAY } from '@/lib/domain/time';
import type { AdminCustomerDto, AdminCustomerListDto, CustomerSegment } from '@/lib/contracts/admin';
import type { AdminCustomersQuery } from '@/lib/contracts/schemas';
import { customerActivity } from './activity';
import { toCardDto } from './dto';
import { toRows } from './customers';
import { getProgram, toProgramDto } from './program';

/**
 * Customer groups (section 15). Reward ready = a voucher is waiting. Of the rest, Active = a visit in the last 30 days and
 * Not seen in 30 days = none. A customer who joined in the app and has not been to a counter yet counts from the day they joined.
 */
export function readyWhere(now: Date): Prisma.CustomerWhereInput {
  return { vouchers: { some: { redeemedAt: null, expiresAt: { gt: now } } } };
}

/**
 * "Last seen" is the last visit, or the day they joined when they have not been to a counter yet. Both groups are written in
 * the positive on purpose: `NOT (lastVisitAt >= cutoff)` is NULL, not true, for a customer who never visited, so negating the
 * "recent" test would silently drop exactly the customers who joined long ago and never came.
 */
const noVisitYet: Prisma.CustomerWhereInput = { OR: [{ card: { is: { lastVisitAt: null } } }, { card: { is: null } }] };

export function recentWhere(now: Date): Prisma.CustomerWhereInput {
  const cutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY);
  return { OR: [{ card: { is: { lastVisitAt: { gte: cutoff } } } }, { AND: [noVisitYet, { joinedAt: { gte: cutoff } }] }] };
}

/** Not seen in the last 30 days: the exact opposite of `recentWhere`, written out so that no customer falls between the two. */
export function lapsedWhere(now: Date): Prisma.CustomerWhereInput {
  const cutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY);
  return { OR: [{ card: { is: { lastVisitAt: { lt: cutoff } } } }, { AND: [noVisitYet, { joinedAt: { lt: cutoff } }] }] };
}

export function segmentWhere(segment: CustomerSegment, now: Date): Prisma.CustomerWhereInput {
  switch (segment) {
    case 'ready':
      return readyWhere(now);
    case 'active':
      return { AND: [{ NOT: readyWhere(now) }, recentWhere(now)] };
    case 'inactive':
      return { AND: [{ NOT: readyWhere(now) }, lapsedWhere(now)] };
    default:
      return {};
  }
}

function searchWhere(q: string | undefined): Prisma.CustomerWhereInput {
  const text = q?.trim();
  if (!text) return {};
  const digits = text.replace(/\D/g, '');
  return { OR: [{ name: { contains: text, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] };
}

function orderBy(sort: AdminCustomersQuery['sort']): Prisma.CustomerOrderByWithRelationInput[] {
  if (sort === 'visits') return [{ card: { visits: 'desc' } }, { joinedAt: 'desc' }];
  if (sort === 'name') return [{ name: { sort: 'asc', nulls: 'last' } }, { joinedAt: 'desc' }];
  return [{ card: { lastVisitAt: { sort: 'desc', nulls: 'last' } } }, { joinedAt: 'desc' }];
}

export async function listCustomers(tx: Tx, input: { query: AdminCustomersQuery; role: StaffRole; now: Date }): Promise<AdminCustomerListDto> {
  const { query, role, now } = input;
  const base: Prisma.CustomerWhereInput = { deletedAt: null };
  const where: Prisma.CustomerWhereInput = { AND: [base, segmentWhere(query.segment, now), searchWhere(query.q)] };

  const [items, total, all, active, ready, inactive] = await Promise.all([
    tx.customer.findMany({ where, orderBy: orderBy(query.sort), skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { card: true } }),
    tx.customer.count({ where }),
    tx.customer.count({ where: base }),
    tx.customer.count({ where: { AND: [base, segmentWhere('active', now)] } }),
    tx.customer.count({ where: { AND: [base, segmentWhere('ready', now)] } }),
    tx.customer.count({ where: { AND: [base, segmentWhere('inactive', now)] } }),
  ]);
  return { items: await toRows(tx, items, role, now), total, page: query.page, pageSize: query.pageSize, counts: { all, active, ready, inactive } };
}

export async function adminCustomerView(tx: Tx, input: { customerId: string; role: StaffRole; now: Date }): Promise<AdminCustomerDto> {
  const { customerId, role, now } = input;
  const customer = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, include: { card: true, joinedBranch: { select: { nameBn: true, nameEn: true } } } });
  if (!customer || !customer.card) throw fail.notFound('Customer');

  const [rows, program, page, visitSpan, favourite] = await Promise.all([
    toRows(tx, [customer], role, now),
    getProgram(tx),
    customerActivity(tx, { customerId, limit: 30, audience: 'staff' }),
    tx.visit.aggregate({ where: { customerId }, _min: { day: true }, _max: { day: true }, _count: { _all: true } }),
    tx.voucher.groupBy({
      by: ['chosenItemBn', 'chosenItemEn'],
      where: { customerId, redeemedAt: { not: null }, chosenItemEn: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { chosenItemEn: 'desc' } },
      take: 1,
    }),
  ]);

  const visits = visitSpan._count._all;
  const spanDays = visitSpan._min.day && visitSpan._max.day ? (visitSpan._max.day.getTime() - visitSpan._min.day.getTime()) / DAY : 0;
  const fav = favourite[0];
  return {
    row: rows[0],
    profile: {
      birthday: customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null,
      smsConsent: customer.smsConsent,
      language: customer.language === 'BN' ? 'bn' : 'en',
      joinedAt: customer.joinedAt.toISOString(),
      joinedVia: customer.joinedVia.toLowerCase() as 'app' | 'counter' | 'management',
      joinedBranch: customer.joinedBranch ? { bn: customer.joinedBranch.nameBn, en: customer.joinedBranch.nameEn } : null,
      note: customer.internalNote,
    },
    card: toCardDto(customer.card),
    program: toProgramDto(program),
    stats: {
      visits: customer.card.visits,
      lifetimeStamps: customer.card.lifetimeStamps,
      rewardsEarned: customer.card.rewardsEarned,
      averageGapDays: visits > 1 ? Math.round(spanDays / (visits - 1)) : null,
      favouriteReward: fav?.chosenItemBn && fav.chosenItemEn ? { bn: fav.chosenItemBn, en: fav.chosenItemEn } : null,
    },
    activity: page.items,
    nextBefore: page.nextBefore,
  };
}

/** Cells that start with = + - @ are read as formulas by Excel, so a name like "=HYPERLINK(...)" could run something. Prefix them with a quote (OWASP). */
const csvCell = (value: string | number | null) => {
  const s = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** MG-05: the filtered customer list as a CSV file. Owner only (BR-25). Read in batches so a large list does not load at once. */
export async function exportCustomersCsv(tx: Tx, input: { segment: CustomerSegment; q?: string; now: Date; stampsPerCard: number }): Promise<string> {
  const where: Prisma.CustomerWhereInput = { AND: [{ deletedAt: null }, segmentWhere(input.segment, input.now), searchWhere(input.q)] };
  const lines: string[] = [['Member no', 'Name', 'Mobile', 'Stamps', 'Visits', 'Rewards earned', 'Last visit', 'Joined', 'Offer SMS'].map(csvCell).join(',')];
  let cursor: string | undefined;
  for (;;) {
    const batch = await tx.customer.findMany({ where, orderBy: { id: 'asc' }, take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), include: { card: true } });
    if (!batch.length) break;
    for (const c of batch) {
      lines.push(
        [
          c.memberNo,
          c.name,
          c.phone,
          `${c.card?.stamps ?? 0}/${input.stampsPerCard}`,
          c.card?.visits ?? 0,
          c.card?.rewardsEarned ?? 0,
          c.card?.lastVisitAt?.toISOString().slice(0, 10) ?? '',
          c.joinedAt.toISOString().slice(0, 10),
          c.smsConsent ? 'yes' : 'no',
        ].map(csvCell).join(','),
      );
    }
    cursor = batch[batch.length - 1].id;
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
