import { approveOverride } from '@/server/auth/staff';
import { addStampsAtCounter, type StaffActor } from '@/server/domain/stamps';
import { toStampResultDto } from '@/server/domain/views';
import { staffRoute } from '@/server/http';
import { addStampsRequest } from '@/lib/contracts/schemas';
import type { StampResultDto } from '@/lib/contracts/dto';

/**
 * Give stamps at the counter (CA-05, CA-06, CA-10). Send a fresh `idempotencyKey` with every button press: a retry with the
 * same key returns the first result instead of stamping twice. Over the daily limit the answer is 409 DAILY_LIMIT_REACHED;
 * a manager's PIN in `overridePin` allows it (BR-02) and is recorded on the ledger.
 */
export const POST = staffRoute({ permission: 'counter.work', body: addStampsRequest }, async ({ staff, body }): Promise<StampResultDto> => {
  const actor: StaffActor = { id: staff.staff.id, role: staff.staff.role, branchId: staff.branchId };
  const approverId = body.overridePin ? (await approveOverride({ actor, pin: body.overridePin })).approverId : null;
  const outcome = await addStampsAtCounter({ customerId: body.customerId, count: body.count, idempotencyKey: body.idempotencyKey, actor, approverId });
  return toStampResultDto(outcome, new Date());
});
