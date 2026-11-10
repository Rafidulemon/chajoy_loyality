import { z } from 'zod';
import { resetStaffPin } from '@/server/domain/admin-staff';
import { staffContext } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import type { StaffSecretDto } from '@/lib/contracts/admin';

/** A forgotten PIN: makes a new one (shown once), clears a lockout and signs the person out everywhere. */
export const POST = staffRoute({ permission: 'staff.manage', params: z.object({ id: z.uuid() }) }, async ({ staff, params, requestId }): Promise<StaffSecretDto> =>
  resetStaffPin({ id: params.id, ctx: staffContext(staff, requestId), actingStaffId: staff.staff.id }));
