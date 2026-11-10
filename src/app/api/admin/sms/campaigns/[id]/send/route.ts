import { z } from 'zod';
import { processCampaign } from '@/server/domain/admin-sms';
import { staffRoute } from '@/server/http';
import type { SmsCampaignDto } from '@/lib/contracts/admin';

/** Carries on sending a campaign that did not finish in one request. Safe to call repeatedly: a message is never sent twice. */
export const POST = staffRoute({ permission: 'sms.send', params: z.object({ id: z.uuid() }) }, async ({ params }): Promise<SmsCampaignDto> => processCampaign(params.id));
