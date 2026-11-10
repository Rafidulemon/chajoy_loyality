import { z } from 'zod';
import { setOfferStatus } from '@/server/domain/admin-offers';
import { staffContext } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import { offerStatus } from '@/lib/contracts/schemas';
import type { AdminOfferDto } from '@/lib/contracts/admin';

/** Pause or resume an offer. A paused offer disappears from customers at once and keeps its numbers. */
export const POST = staffRoute({ permission: 'offers.manage', params: z.object({ id: z.uuid() }), body: offerStatus }, async ({ staff, params, body, requestId }): Promise<AdminOfferDto> =>
  setOfferStatus({ id: params.id, status: body.status, ctx: staffContext(staff, requestId) }));
