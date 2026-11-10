import { createCampaign } from '@/server/domain/admin-sms';
import { staffContext } from '@/server/domain/audit';
import { created, staffRoute } from '@/server/http';
import { smsCampaignCreate } from '@/lib/contracts/schemas';

/**
 * Send or schedule an SMS campaign (MG-15). Refused when nobody in the group agreed to offer SMS (422) or when the balance is
 * lower than recipients x parts (409). Without `scheduledAt` it starts sending at once.
 */
export const POST = staffRoute({ permission: 'sms.send', body: smsCampaignCreate }, async ({ staff, body, requestId }) => created(await createCampaign({ data: body, ctx: staffContext(staff, requestId) })));
