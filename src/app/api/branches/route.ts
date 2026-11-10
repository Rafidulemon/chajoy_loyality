import { db } from '@/server/db';
import { toBranchDto } from '@/server/domain/dto';
import { publicRoute } from '@/server/http';
import type { BranchDto } from '@/lib/contracts/dto';

/** The outlets with their opening hours: public information that rarely changes, so it can be cached for a short while (a changed opening time reaches customers within about a minute). */
export const GET = publicRoute({ cache: 'public, max-age=10, s-maxage=20, stale-while-revalidate=40' }, async (): Promise<BranchDto[]> => {
  const branches = await db().branch.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }] });
  return branches.map(toBranchDto);
});
