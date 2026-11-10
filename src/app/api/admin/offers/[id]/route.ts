import { z } from 'zod';
import { deleteOffer, updateOffer } from '@/server/domain/admin-offers';
import { staffContext } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import { offerSave } from '@/lib/contracts/schemas';
import type { AdminOfferDto } from '@/lib/contracts/admin';

const params = z.object({ id: z.uuid() });

/** Edit an offer. The run length counts from now. */
export const PUT = staffRoute({ permission: 'offers.manage', params, body: offerSave }, async ({ staff, params: p, body, requestId }): Promise<AdminOfferDto> =>
  updateOffer({ id: p.id, data: body, ctx: staffContext(staff, requestId) }));

/** Delete an offer: it disappears from customers at once; claims and vouchers that point at it stay. */
export const DELETE = staffRoute({ permission: 'offers.manage', params }, async ({ staff, params: p, requestId }) => {
  await deleteOffer({ id: p.id, ctx: staffContext(staff, requestId) });
  return undefined;
});
