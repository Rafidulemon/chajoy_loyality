import { z } from 'zod';
import { db } from '@/server/db';
import { dashboardFor } from '@/server/domain/dashboard';
import { staffRoute } from '@/server/http';
import type { DashboardDto } from '@/lib/contracts/admin';

/**
 * The dashboard (MG-01, MG-02). A manager sees their own outlets; an owner sees all of them, or one with `?branch=`.
 */
export const GET = staffRoute({ permission: 'dashboard.view', query: z.object({ branch: z.uuid().optional() }) }, async ({ staff, query }): Promise<DashboardDto> => {
  const own = staff.staff.role === 'OWNER' ? (query.branch ? [query.branch] : null) : staff.allowedBranchIds;
  return dashboardFor(db(), { branchIds: own, now: new Date() });
});
