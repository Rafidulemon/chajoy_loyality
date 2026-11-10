import { staffMe } from '@/server/auth/staff-view';
import { staffRoute } from '@/server/http';
import type { StaffMeDto } from '@/lib/contracts/dto';

/** The signed-in staff member and the outlet this session works at, for the cashier app's header. */
export const GET = staffRoute({ permission: 'counter.work' }, async ({ staff }): Promise<StaffMeDto> => staffMe(staff));
