import { z } from 'zod';
import { redeemVoucher } from '@/server/domain/vouchers';
import { toCardDto, toVoucherDto } from '@/server/domain/dto';
import type { StaffActor } from '@/server/domain/stamps';
import { staffRoute } from '@/server/http';
import { redeemRequest } from '@/lib/contracts/schemas';
import type { RedeemResultDto } from '@/lib/contracts/dto';

/** Give a reward (CA-11, CA-12). A voucher works once; a used or expired one is refused. A voucher with a choice needs `itemId`. */
export const POST = staffRoute({ permission: 'counter.work', params: z.object({ id: z.uuid() }), body: redeemRequest }, async ({ staff, params, body }): Promise<RedeemResultDto> => {
  const actor: StaffActor = { id: staff.staff.id, role: staff.staff.role, branchId: staff.branchId };
  const now = new Date();
  const result = await redeemVoucher({ voucherId: params.id, itemId: body.itemId, actor, at: now });
  return { voucher: toVoucherDto(result.voucher, now), card: toCardDto(result.card) };
});
