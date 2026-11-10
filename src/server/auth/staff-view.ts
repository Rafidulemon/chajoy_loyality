import 'server-only';
import { db } from '../db';
import { toBranchDto } from '../domain/dto';
import type { StaffMeDto } from '@/lib/contracts/dto';
import type { StaffSession } from './session';

/** Who is signed in as staff and where they work, for the apps' headers and guards. */
export async function staffMe(session: StaffSession): Promise<StaffMeDto> {
  const branch = session.branchId ? await db().branch.findUnique({ where: { id: session.branchId } }) : null;
  return {
    id: session.staff.id,
    name: session.staff.name,
    role: session.staff.role.toLowerCase() as StaffMeDto['role'],
    phone: session.staff.phone,
    branch: branch ? toBranchDto(branch) : null,
    allowedBranchIds: session.allowedBranchIds,
  };
}
