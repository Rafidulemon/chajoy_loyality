import { z } from 'zod';
import { db } from '@/server/db';
import { adminCustomerView } from '@/server/domain/admin-customers';
import { staffRoute } from '@/server/http';
import type { AdminCustomerDto } from '@/lib/contracts/admin';

/** One customer for management: profile, card, totals and the first page of the activity timeline (MG-06). */
export const GET = staffRoute({ permission: 'customers.list', params: z.object({ id: z.uuid() }) }, async ({ staff, params }): Promise<AdminCustomerDto> =>
  adminCustomerView(db(), { customerId: params.id, role: staff.staff.role, now: new Date() }));
