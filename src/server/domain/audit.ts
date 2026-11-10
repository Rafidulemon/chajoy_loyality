import 'server-only';
import type { Tx } from '../db';
import type { Prisma } from '../db';
import type { ActorType } from '@/generated/prisma/enums';

export type Actor = { type: 'STAFF' | 'CUSTOMER' | 'SYSTEM'; id: string | null };

/** The audit context of a request made by a signed-in staff member. */
export const staffContext = (session: { staff: { id: string }; branchId: string | null }, requestId: string): RequestContext => ({
  requestId,
  actor: { type: 'STAFF', id: session.staff.id },
  branchId: session.branchId,
});

/** Who is doing something, carried through a request so every write can name its author. */
export type RequestContext = { requestId?: string; actor: Actor; branchId?: string | null };

type Json = Prisma.InputJsonValue | null;

/**
 * Appends to the audit log (MG-23): rules, offers, staff, outlets and manual stamp adjustments. Written in the same
 * transaction as the change, so a change cannot exist without its record. Never pass secrets or PINs in before/after.
 */
export async function writeAudit(
  tx: Tx,
  ctx: RequestContext,
  entry: { action: string; entityType: string; entityId?: string | null; before?: Json; after?: Json; branchId?: string | null; at?: Date },
) {
  await tx.auditLog.create({
    data: {
      // Always the application clock, like every other timestamp written in the same request, so the log reads in the order things happened.
      at: entry.at ?? new Date(),
      actorType: ctx.actor.type as ActorType,
      actorId: ctx.actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      branchId: entry.branchId ?? ctx.branchId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
      requestId: ctx.requestId,
    },
  });
}
