import { z } from 'zod';
import { updateStaff } from '@/server/domain/admin-staff';
import { staffContext } from '@/server/domain/audit';
import { staffRoute } from '@/server/http';
import { staffUpdate } from '@/lib/contracts/schemas';
import type { StaffRowDto } from '@/lib/contracts/admin';

/** Change a name, role or outlets, or switch an account on or off. Switching off signs the person out at once. */
export const PATCH = staffRoute({ permission: 'staff.manage', params: z.object({ id: z.uuid() }), body: staffUpdate }, async ({ staff, params, body, requestId }): Promise<StaffRowDto> =>
  updateStaff({ id: params.id, data: body, ctx: staffContext(staff, requestId), actingStaffId: staff.staff.id }));
