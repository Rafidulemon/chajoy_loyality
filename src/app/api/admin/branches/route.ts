import { db } from '@/server/db';
import { toBranchDto } from '@/server/domain/dto';
import { staffRoute } from '@/server/http';
import type { AdminBranchDto } from '@/lib/contracts/admin';

/** The outlets for management, with how many staff work at each and how many customers joined there. */
export const GET = staffRoute({ permission: 'dashboard.view' }, async (): Promise<AdminBranchDto[]> => {
  const [branches, staff, joined] = await Promise.all([
    db().branch.findMany({ orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }] }),
    db().staffBranch.groupBy({ by: ['branchId'], where: { staff: { active: true } }, _count: { _all: true } }),
    db().customer.groupBy({ by: ['joinedBranchId'], where: { deletedAt: null, joinedBranchId: { not: null } }, _count: { _all: true } }),
  ]);
  return branches.map((b) => ({
    ...toBranchDto(b),
    staffCount: staff.find((s) => s.branchId === b.id)?._count._all ?? 0,
    customerCount: joined.find((j) => j.joinedBranchId === b.id)?._count._all ?? 0,
  }));
});
