import 'server-only';
import { z } from 'zod';
import { maskPhone } from '@/lib/domain/phone';
import { seesFullPhone, type StaffRole } from '@/lib/domain/permissions';
import { ACTIVE_WINDOW_DAYS, voucherStatus } from '@/lib/domain/rules';
import { DAY } from '@/lib/domain/time';
import type { Branch, Card, Customer, Offer, Voucher } from '@/generated/prisma/client';
import type { BranchDto, CardDto, CustomerRowDto, CustomerStatusDto, MeDto, OfferDto, TextPair, VoucherDto } from '@/lib/contracts/dto';

/** Row -> JSON the API sends. Dates become ISO strings; Bn/En column pairs become { bn, en }. */

const pair = (bn: string, en: string): TextPair => ({ bn, en });

export function toBranchDto(b: Branch): BranchDto {
  return {
    id: b.id,
    slug: b.slug,
    name: pair(b.nameBn, b.nameEn),
    address: pair(b.addressBn, b.addressEn),
    lat: b.latitude,
    lng: b.longitude,
    openMinute: b.openMinute,
    closeMinute: b.closeMinute,
    main: b.isMain,
    chip: b.chipColor,
    active: b.active,
  };
}

export function toCardDto(c: Pick<Card, 'stamps' | 'visits' | 'lifetimeStamps' | 'rewardsEarned' | 'lastVisitAt' | 'version'>): CardDto {
  return {
    stamps: c.stamps,
    visits: c.visits,
    lifetimeStamps: c.lifetimeStamps,
    rewardsEarned: c.rewardsEarned,
    lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
    version: c.version,
  };
}

const choicesSchema = z.array(z.object({ id: z.string(), nameBn: z.string(), nameEn: z.string() }));

export function toVoucherDto(v: Voucher, now: Date): VoucherDto {
  const parsed = choicesSchema.safeParse(v.choices);
  return {
    id: v.id,
    code: v.code,
    title: pair(v.titleBn, v.titleEn),
    source: pair(v.sourceBn, v.sourceEn),
    origin: v.source === 'CARD' ? 'card' : 'offer',
    issuedAt: v.issuedAt.toISOString(),
    expiresAt: v.expiresAt.toISOString(),
    redeemedAt: v.redeemedAt?.toISOString() ?? null,
    status: voucherStatus(v, now),
    choices: parsed.success ? parsed.data.map((c) => ({ id: c.id, name: pair(c.nameBn, c.nameEn) })) : [],
    chosen: v.chosenItemBn && v.chosenItemEn ? pair(v.chosenItemBn, v.chosenItemEn) : null,
  };
}

const termsSchema = z.array(z.object({ bn: z.string(), en: z.string() }));

export function toOfferDto(o: Offer, extra?: { claims?: number }): OfferDto {
  const terms = termsSchema.safeParse(o.terms);
  return {
    id: o.id,
    kind: o.kind.toLowerCase() as OfferDto['kind'],
    status: o.status.toLowerCase() as OfferDto['status'],
    badge: pair(o.badgeBn, o.badgeEn),
    title: pair(o.titleBn, o.titleEn),
    body: pair(o.bodyBn, o.bodyEn),
    terms: terms.success ? terms.data : [],
    bonusStamps: o.bonusStamps,
    reward: o.rewardBn && o.rewardEn ? pair(o.rewardBn, o.rewardEn) : null,
    voucherDays: o.voucherDays,
    bg: o.bg,
    fg: o.fg,
    startsAt: o.startsAt.toISOString(),
    endsAt: o.endsAt?.toISOString() ?? null,
    ...(extra?.claims !== undefined ? { claims: extra.claims } : {}),
  };
}

export function toMeDto(c: Customer): MeDto {
  return {
    id: c.id,
    memberNo: c.memberNo,
    name: c.name,
    phone: c.phone,
    birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
    smsConsent: c.smsConsent,
    language: c.language === 'BN' ? 'bn' : 'en',
    joinedAt: c.joinedAt.toISOString(),
    profileComplete: c.profileCompletedAt !== null,
  };
}

/**
 * Active = a visit in the last 30 days, Reward ready = at least one voucher waiting, Not seen = neither (section 15).
 * A customer who joined in the app and has not been to a counter yet counts from the day they joined.
 */
export function customerStatus(c: { lastVisitAt: Date | null; joinedAt: Date }, hasReadyVoucher: boolean, now: Date): CustomerStatusDto {
  if (hasReadyVoucher) return 'ready';
  const lastSeen = c.lastVisitAt ?? c.joinedAt;
  return now.getTime() - lastSeen.getTime() > ACTIVE_WINDOW_DAYS * DAY ? 'inactive' : 'active';
}

export type CustomerWithCard = Customer & { card: Card | null };

export function toCustomerRowDto(c: CustomerWithCard, opts: { hasReadyVoucher: boolean; role: StaffRole; now: Date }): CustomerRowDto {
  return {
    id: c.id,
    memberNo: c.memberNo,
    name: c.name,
    phone: seesFullPhone(opts.role) ? c.phone : maskPhone(c.phone),
    stamps: c.card?.stamps ?? 0,
    visits: c.card?.visits ?? 0,
    rewardsEarned: c.card?.rewardsEarned ?? 0,
    lastVisitAt: c.card?.lastVisitAt?.toISOString() ?? null,
    joinedAt: c.joinedAt.toISOString(),
    hasReadyVoucher: opts.hasReadyVoucher,
    status: customerStatus({ lastVisitAt: c.card?.lastVisitAt ?? null, joinedAt: c.joinedAt }, opts.hasReadyVoucher, opts.now),
  };
}
