import { db } from '@/server/db';
import { smsOverview } from '@/server/domain/admin-sms';
import { staffRoute } from '@/server/http';
import type { SmsOverviewDto } from '@/lib/contracts/admin';

/** The SMS balance, how many customers each audience reaches (only those who agreed to offer SMS, BR-22) and the past campaigns. */
export const GET = staffRoute({ permission: 'sms.send' }, async (): Promise<SmsOverviewDto> => smsOverview(db(), new Date()));
