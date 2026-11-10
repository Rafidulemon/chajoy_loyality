import 'server-only';
import type { Tx } from '../db';
import { fail } from '../errors';
import { dailyRoom } from '@/lib/domain/rules';
import type { StaffRole } from '@/lib/domain/permissions';
import type { CashierCustomerDto, StampResultDto, WalletDto } from '@/lib/contracts/dto';
import { toCardDto, toMeDto, toOfferDto, toVoucherDto } from './dto';
import { toRows } from './customers';
import { listLiveOffers } from './offers';
import { getProgram, toProgramDto } from './program';
import { givenToday, type StampOutcome } from './stamps';

/** Everything the customer app shows, read in one go. */
export async function walletFor(tx: Tx, customerId: string, now: Date): Promise<WalletDto> {
  const [customer, program, vouchers, claims, offers] = await Promise.all([
    tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, include: { card: true } }),
    getProgram(tx),
    tx.voucher.findMany({ where: { customerId }, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], take: 60 }),
    tx.offerClaim.findMany({ where: { customerId }, select: { offerId: true } }),
    listLiveOffers(tx, now),
  ]);
  if (!customer || !customer.card) throw fail.notFound('Customer');
  return {
    me: toMeDto(customer),
    card: toCardDto(customer.card),
    program: toProgramDto(program),
    vouchers: vouchers.map((v) => toVoucherDto(v, now)),
    claimedOfferIds: claims.map((c) => c.offerId),
    offers: offers.map((o) => toOfferDto(o)),
    serverTime: now.toISOString(),
  };
}

/** The cashier's view of one customer: who they are, the card, what is allowed today and the vouchers waiting. */
export async function cashierCustomerView(tx: Tx, input: { customerId: string; role: StaffRole; now: Date }): Promise<CashierCustomerDto> {
  const { customerId, role, now } = input;
  const customer = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null }, include: { card: true } });
  if (!customer || !customer.card) throw fail.notFound('Customer');
  const [rows, program, ready, given] = await Promise.all([
    toRows(tx, [customer], role, now),
    getProgram(tx),
    tx.voucher.findMany({ where: { customerId, redeemedAt: null, expiresAt: { gt: now } }, orderBy: { expiresAt: 'asc' } }),
    givenToday(tx, customerId, now),
  ]);
  const room = dailyRoom(program.dailyLimit, given);
  return {
    customer: rows[0],
    card: toCardDto(customer.card),
    program: toProgramDto(program),
    givenToday: given,
    roomToday: Number.isFinite(room) ? room : null,
    readyVouchers: ready.map((v) => toVoucherDto(v, now)),
  };
}

export function toStampResultDto(outcome: StampOutcome, now: Date): StampResultDto {
  return {
    entryId: outcome.entry.id,
    added: outcome.entry.count,
    card: toCardDto(outcome.card),
    completed: outcome.completed,
    vouchers: outcome.vouchers.map((v) => toVoucherDto(v, now)),
    givenToday: outcome.givenToday,
    replayed: outcome.replayed,
  };
}
