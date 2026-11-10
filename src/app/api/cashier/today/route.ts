import { db } from '@/server/db';
import { dayCounters, recentActivity } from '@/server/domain/activity';
import { staffRoute } from '@/server/http';
import { dhakaDayStart } from '@/lib/domain/time';
import type { TodayDto } from '@/lib/contracts/dto';

/** The cashier's day at this outlet (CA-15): counters and the latest transactions. A manager or owner without an outlet sees all outlets. */
export const GET = staffRoute({ permission: 'counter.work' }, async ({ staff }): Promise<TodayDto> => {
  const now = new Date();
  const [counters, feed] = await Promise.all([
    dayCounters(db(), { branchId: staff.branchId, at: now }),
    recentActivity(db(), { branchIds: staff.branchId ? [staff.branchId] : null, since: dhakaDayStart(now), limit: 40 }),
  ]);
  return { stamps: counters.stamps, rewards: counters.rewards, newCustomers: counters.newCustomers, cancelled: counters.cancelled, feed };
});
