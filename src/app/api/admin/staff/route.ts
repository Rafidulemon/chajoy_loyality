import { db } from '@/server/db';
import { createStaff, listStaff } from '@/server/domain/admin-staff';
import { staffContext } from '@/server/domain/audit';
import { created, staffRoute } from '@/server/http';
import { staffCreate } from '@/lib/contracts/schemas';
import type { StaffRowDto } from '@/lib/contracts/admin';

/** Everyone with an account (MG-17). Owner only. */
export const GET = staffRoute({ permission: 'staff.manage' }, async (): Promise<StaffRowDto[]> => listStaff(db(), new Date()));

/** Add a cashier or manager. The response carries their first PIN, shown once, to hand over. */
export const POST = staffRoute({ permission: 'staff.manage', body: staffCreate }, async ({ staff, body, requestId }) => created(await createStaff({ data: body, ctx: staffContext(staff, requestId) })));
