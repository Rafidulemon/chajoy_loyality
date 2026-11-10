import 'server-only';
import { db, lockCard } from '../db';
import { AppError, fail } from '../errors';
import { normalizeVoucherCode } from '@/lib/domain/codes';
import { voucherStatus } from '@/lib/domain/rules';
import type { Card, Voucher } from '@/generated/prisma/client';
import { touchVisit } from './ledger';
import type { StaffActor } from './stamps';

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** Finds a voucher by the code under its QR, wherever it belongs (CA-12). The code is cleaned up first: case, spaces and dashes do not matter. */
export async function findVoucherByCode(input: string) {
  const notFound = () => new AppError('VOUCHER_NOT_FOUND', 404, 'No voucher has that code');
  const code = normalizeVoucherCode(input);
  if (!code) throw notFound();
  const voucher = await db().voucher.findUnique({ where: { code }, include: { customer: { select: { id: true, name: true, memberNo: true, deletedAt: true } } } });
  if (!voucher || voucher.customer.deletedAt) throw notFound();
  return voucher;
}

type Choice = { id: string; nameBn: string; nameEn: string };
const choicesOf = (v: Pick<Voucher, 'choices'>): Choice[] => (Array.isArray(v.choices) ? (v.choices as Choice[]) : []);

/**
 * CA-11, CA-12, BR-08 to BR-11: a cashier gives a reward.
 *
 * Using a voucher is one atomic update that only matches a voucher that is unused and not expired, so two cashiers
 * typing the same code at the same moment cannot both succeed. A voucher that offers a choice needs the item to be picked
 * from the items it had when it was issued (BR-09, BR-14). A redemption counts as a visit at the cashier's outlet.
 */
export async function redeemVoucher(input: { voucherId: string; itemId?: string | null; actor: StaffActor; at?: Date }): Promise<{ voucher: Voucher; card: Card }> {
  const at = input.at ?? new Date();
  return db().$transaction(async (tx) => {
    const found = await tx.voucher.findUnique({ where: { id: input.voucherId }, select: { customerId: true } });
    if (!found) throw fail.notFound('Voucher');
    await lockCard(tx, found.customerId);

    const voucher = await tx.voucher.findUniqueOrThrow({ where: { id: input.voucherId } });
    const status = voucherStatus(voucher, at);
    if (status === 'used') throw fail.conflict('VOUCHER_USED', 'This voucher was already used', { redeemedAt: voucher.redeemedAt?.toISOString() });
    if (status === 'expired') throw fail.conflict('VOUCHER_EXPIRED', 'This voucher has expired', { expiresAt: voucher.expiresAt.toISOString() });

    const choices = choicesOf(voucher);
    let chosen: Choice | null = null;
    if (choices.length > 0) {
      if (!input.itemId) throw fail.unprocessable('ITEM_REQUIRED', 'Pick which item the customer takes');
      chosen = choices.find((c) => c.id === input.itemId) ?? null;
      if (!chosen) throw fail.unprocessable('ITEM_NOT_ALLOWED', 'That item is not one of the choices on this voucher');
    } else if (input.itemId) {
      throw fail.unprocessable('ITEM_NOT_ALLOWED', 'This voucher has no choice of item');
    }

    const used = await tx.voucher.updateMany({
      where: { id: voucher.id, redeemedAt: null, expiresAt: { gt: at } },
      data: {
        redeemedAt: at,
        redeemedById: input.actor.id,
        redeemedAtId: input.actor.branchId,
        chosenItemId: chosen?.id ?? null,
        chosenItemBn: chosen?.nameBn ?? null,
        chosenItemEn: chosen?.nameEn ?? null,
      },
    });
    if (used.count === 0) throw fail.conflict('VOUCHER_USED', 'This voucher was already used');

    const cardRow = await tx.card.findUniqueOrThrow({ where: { customerId: voucher.customerId } });
    const card = input.actor.branchId ? await touchVisit(tx, cardRow, voucher.customerId, input.actor.branchId, at) : await tx.card.update({ where: { id: cardRow.id }, data: { version: { increment: 1 } } });

    await tx.notification.create({
      data: {
        customerId: voucher.customerId,
        kind: 'REWARD_REDEEMED',
        params: { voucherId: voucher.id, title: { bn: voucher.titleBn, en: voucher.titleEn }, item: chosen ? { bn: chosen.nameBn, en: chosen.nameEn } : null },
        createdAt: at,
      },
    });
    return { voucher: await tx.voucher.findUniqueOrThrow({ where: { id: voucher.id } }), card };
  }, TX_OPTIONS);
}
