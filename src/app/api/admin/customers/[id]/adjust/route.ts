import { z } from 'zod';
import { adjustStamps } from '@/server/domain/stamps';
import { staffContext } from '@/server/domain/audit';
import { toCardDto } from '@/server/domain/dto';
import { staffRoute } from '@/server/http';
import { adjustStampsRequest } from '@/lib/contracts/schemas';
import type { AdjustResultDto } from '@/lib/contracts/admin';

/**
 * Adjust a customer's stamps by hand, up or down, with a reason (MG-07). A manager or owner only. Adding enough completes the
 * card and issues a reward voucher; taking away stops at an empty card. It does not count against the daily limit (BR-03).
 */
export const POST = staffRoute({ permission: 'stamps.adjust', params: z.object({ id: z.uuid() }), body: adjustStampsRequest }, async ({ staff, params, body, requestId }): Promise<AdjustResultDto> => {
  const result = await adjustStamps({
    customerId: params.id,
    delta: body.delta,
    reason: body.reason,
    actor: { id: staff.staff.id, role: staff.staff.role, branchId: staff.branchId },
    ctx: staffContext(staff, requestId),
  });
  return { card: toCardDto(result.card), completed: result.completed, entryId: result.entry.id };
});
