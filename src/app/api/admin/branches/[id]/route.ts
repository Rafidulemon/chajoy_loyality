import { z } from 'zod';
import { db } from '@/server/db';
import { fail } from '@/server/errors';
import { staffContext, writeAudit } from '@/server/domain/audit';
import { toBranchDto } from '@/server/domain/dto';
import { staffRoute } from '@/server/http';
import { branchHours } from '@/lib/contracts/schemas';
import type { BranchDto } from '@/lib/contracts/dto';

/** Change an outlet's opening hours (MG-18, BR-26). Customers see open or closed to match as soon as their app reloads. Owner only. */
export const PATCH = staffRoute({ permission: 'outlets.manage', params: z.object({ id: z.uuid() }), body: branchHours }, async ({ staff, params, body, requestId }): Promise<BranchDto> =>
  db().$transaction(async (tx) => {
    const before = await tx.branch.findUnique({ where: { id: params.id } });
    if (!before) throw fail.notFound('Outlet');
    const after = await tx.branch.update({ where: { id: params.id }, data: { openMinute: body.openMinute, closeMinute: body.closeMinute } });
    await writeAudit(tx, staffContext(staff, requestId), {
      action: 'branch.hours',
      entityType: 'Branch',
      entityId: params.id,
      before: { openMinute: before.openMinute, closeMinute: before.closeMinute },
      after: { openMinute: after.openMinute, closeMinute: after.closeMinute },
    });
    return toBranchDto(after);
  }));
