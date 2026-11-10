import { z } from 'zod';
import { claimOffer } from '@/server/domain/offers';
import { toCardDto, toVoucherDto } from '@/server/domain/dto';
import { customerRoute } from '@/server/http';
import type { CardDto, VoucherDto } from '@/lib/contracts/dto';

/** Claim an offer: a bonus stamp lands on the card at once, a free-item offer creates a voucher. Once per customer. */
export const POST = customerRoute({ params: z.object({ id: z.uuid() }) }, async ({ customer, params }): Promise<{ card: CardDto; vouchers: VoucherDto[]; completed: number }> => {
  const now = new Date();
  const result = await claimOffer({ customerId: customer.customerId, offerId: params.id, at: now });
  return { card: toCardDto(result.card), vouchers: result.vouchers.map((v) => toVoucherDto(v, now)), completed: result.completed };
});
