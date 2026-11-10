import { z } from 'zod';
import { undoStamps, type StaffActor } from '@/server/domain/stamps';
import { toStampResultDto } from '@/server/domain/views';
import { staffRoute } from '@/server/http';
import type { StampResultDto } from '@/lib/contracts/dto';

/** Undo the stamps just added (CA-07, BR-04). Refused after ten minutes, when the card was completed, or when anything else happened on the card since. */
export const POST = staffRoute({ permission: 'counter.work', params: z.object({ id: z.uuid() }) }, async ({ staff, params }): Promise<StampResultDto> => {
  const actor: StaffActor = { id: staff.staff.id, role: staff.staff.role, branchId: staff.branchId };
  return toStampResultDto(await undoStamps({ entryId: params.id, actor }), new Date());
});
