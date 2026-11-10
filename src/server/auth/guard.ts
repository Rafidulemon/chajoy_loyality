import 'server-only';
import { fail } from '../errors';
import { can, type Permission } from '@/lib/domain/permissions';
import { readCustomerSession, readStaffSession, type CustomerSession, type StaffSession } from './session';

/** The signed-in customer, or a 401. */
export async function requireCustomer(): Promise<CustomerSession> {
  const session = await readCustomerSession();
  if (!session) throw fail.unauthenticated();
  return session;
}

/** The signed-in staff member, or a 401. With a permission, also a 403 when their role does not have it (MG-22). */
export async function requireStaff(permission?: Permission): Promise<StaffSession> {
  const session = await readStaffSession();
  if (!session) throw fail.unauthenticated();
  if (permission && !can(session.staff.role, permission)) throw fail.forbidden();
  return session;
}
