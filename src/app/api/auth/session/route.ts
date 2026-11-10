import { db } from '@/server/db';
import { readCustomerSession, readStaffSession } from '@/server/auth/session';
import { staffMe } from '@/server/auth/staff-view';
import { toMeDto } from '@/server/domain/dto';
import { publicRoute } from '@/server/http';
import type { MeDto, StaffMeDto } from '@/lib/contracts/dto';

/** Who is signed in on this browser, as a customer and/or as staff. Both are null when nobody is. */
export const GET = publicRoute({}, async (): Promise<{ customer: MeDto | null; staff: StaffMeDto | null }> => {
  const [c, s] = await Promise.all([readCustomerSession(), readStaffSession()]);
  const customer = c ? await db().customer.findUnique({ where: { id: c.customerId } }) : null;
  return { customer: customer ? toMeDto(customer) : null, staff: s ? await staffMe(s) : null };
});
