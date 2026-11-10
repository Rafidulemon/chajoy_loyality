import { z } from 'zod';
import { db } from '@/server/db';
import { fail } from '@/server/errors';
import { staffContext, writeAudit } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import { customerNote } from '@/lib/contracts/schemas';

/** The private note on a customer (MG-06). The audit log records that it changed, not what it says. */
export const PUT = staffRoute({ permission: 'customers.list', params: z.object({ id: z.uuid() }), body: customerNote }, async ({ staff, params, body, requestId }) => {
  const note = body.note?.trim() ? body.note.trim() : null;
  await db().$transaction(async (tx) => {
    const found = await tx.customer.updateMany({ where: { id: params.id, deletedAt: null }, data: { internalNote: note } });
    if (found.count === 0) throw fail.notFound('Customer');
    await writeAudit(tx, staffContext(staff, requestId), { action: 'customer.note', entityType: 'Customer', entityId: params.id, after: { hasNote: note !== null } });
  });
  return { note };
});
