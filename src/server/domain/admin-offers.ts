import 'server-only';
import { db, type Tx } from '../db';
import { fail } from '../errors';
import { addDays } from '@/lib/domain/time';
import type { Offer } from '@/generated/prisma/client';
import type { OfferKind, OfferStatus } from '@/generated/prisma/enums';
import type { AdminOfferDto } from '@/lib/contracts/admin';
import type { OfferSave } from '@/lib/contracts/schemas';
import { writeAudit, type RequestContext } from './audit';
import { toOfferDto } from './dto';

/** Offers as management manages them (MG-12, MG-13): every offer that is not deleted, live or paused, with how many customers claimed it. */
export async function listAdminOffers(tx: Tx): Promise<AdminOfferDto[]> {
  const [offers, claims] = await Promise.all([
    tx.offer.findMany({ where: { deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    tx.offerClaim.groupBy({ by: ['offerId'], _count: { _all: true } }),
  ]);
  const claimed = new Map(claims.map((c) => [c.offerId, c._count._all]));
  return offers.map((o) => toOfferDto(o, { claims: claimed.get(o.id) ?? 0 }) as AdminOfferDto);
}

/** One offer with its claim count. Used inside transactions, so the two queries run one after the other on the one connection. */
async function oneOffer(tx: Tx, id: string): Promise<AdminOfferDto> {
  const offer = await tx.offer.findFirst({ where: { id, deletedAt: null } });
  if (!offer) throw fail.notFound('Offer');
  const claims = await tx.offerClaim.count({ where: { offerId: id } });
  return toOfferDto(offer, { claims }) as AdminOfferDto;
}

/** The columns an offer form sets. A birthday offer has no end date; the run length of the others counts from the moment of saving. */
function offerColumns(data: OfferSave, at: Date) {
  const kind = data.kind.toUpperCase() as OfferKind;
  return {
    kind,
    badgeBn: data.badge.bn,
    badgeEn: data.badge.en,
    titleBn: data.title.bn,
    titleEn: data.title.en,
    bodyBn: data.body.bn,
    bodyEn: data.body.en,
    terms: data.terms,
    bonusStamps: kind === 'STAMP' ? (data.bonusStamps ?? null) : null,
    rewardBn: kind === 'VOUCHER' ? (data.reward?.bn ?? null) : null,
    rewardEn: kind === 'VOUCHER' ? (data.reward?.en ?? null) : null,
    voucherDays: kind === 'VOUCHER' ? (data.voucherDays ?? null) : null,
    bg: data.bg,
    fg: data.fg,
    endsAt: kind === 'BIRTHDAY' || !data.runDays ? null : addDays(at, data.runDays),
  };
}

/** Publishing makes the offer visible to customers at once (MG-13, BR-19). */
export async function createOffer(input: { data: OfferSave; ctx: RequestContext; at?: Date }): Promise<AdminOfferDto> {
  const at = input.at ?? new Date();
  return db().$transaction(async (tx) => {
    const offer = await tx.offer.create({ data: { ...offerColumns(input.data, at), status: 'LIVE', startsAt: at, createdById: input.ctx.actor.id } });
    const dto = await oneOffer(tx, offer.id);
    await writeAudit(tx, input.ctx, { action: 'offer.create', entityType: 'Offer', entityId: offer.id, after: dto as unknown as Record<string, never>, at });
    return dto;
  });
}

export async function updateOffer(input: { id: string; data: OfferSave; ctx: RequestContext; at?: Date }): Promise<AdminOfferDto> {
  const at = input.at ?? new Date();
  return db().$transaction(async (tx) => {
    const before = await oneOffer(tx, input.id);
    await tx.offer.update({ where: { id: input.id }, data: offerColumns(input.data, at) });
    const after = await oneOffer(tx, input.id);
    await writeAudit(tx, input.ctx, { action: 'offer.update', entityType: 'Offer', entityId: input.id, before: before as unknown as Record<string, never>, after: after as unknown as Record<string, never>, at });
    return after;
  });
}

/** Pausing hides the offer from customers at once and keeps its numbers (BR-19). */
export async function setOfferStatus(input: { id: string; status: 'live' | 'paused'; ctx: RequestContext }): Promise<AdminOfferDto> {
  return db().$transaction(async (tx) => {
    const before = await oneOffer(tx, input.id);
    const status = input.status.toUpperCase() as OfferStatus;
    if (before.status === input.status) return before;
    await tx.offer.update({ where: { id: input.id }, data: { status } });
    await writeAudit(tx, input.ctx, { action: `offer.${input.status === 'live' ? 'resume' : 'pause'}`, entityType: 'Offer', entityId: input.id, before: { status: before.status }, after: { status: input.status } });
    return oneOffer(tx, input.id);
  });
}

/** Deleted offers disappear at once but stay in the database, because claims and vouchers point at them. */
export async function deleteOffer(input: { id: string; ctx: RequestContext; at?: Date }): Promise<void> {
  const at = input.at ?? new Date();
  await db().$transaction(async (tx) => {
    const before = await oneOffer(tx, input.id);
    await tx.offer.update({ where: { id: input.id }, data: { deletedAt: at, status: 'PAUSED' } });
    await writeAudit(tx, input.ctx, { action: 'offer.delete', entityType: 'Offer', entityId: input.id, before: before as unknown as Record<string, never>, at });
  });
}

export type { Offer };
