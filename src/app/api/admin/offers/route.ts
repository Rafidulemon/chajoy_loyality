import { db } from '@/server/db';
import { createOffer, listAdminOffers } from '@/server/domain/admin-offers';
import { staffContext } from '@/server/domain/audit';
import { created, staffRoute } from '@/server/http';
import { offerSave } from '@/lib/contracts/schemas';
import type { AdminOfferDto } from '@/lib/contracts/admin';

/** Every offer that is not deleted, live or paused, with its claim count (MG-12, MG-13). */
export const GET = staffRoute({ permission: 'offers.manage' }, async (): Promise<AdminOfferDto[]> => listAdminOffers(db()));

/** Publish an offer. Customers see it at once. */
export const POST = staffRoute({ permission: 'offers.manage', body: offerSave }, async ({ staff, body, requestId }) => created(await createOffer({ data: body, ctx: staffContext(staff, requestId) })));
