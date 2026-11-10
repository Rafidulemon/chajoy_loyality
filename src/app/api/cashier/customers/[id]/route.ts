import { z } from 'zod';
import { db } from '@/server/db';
import { cashierCustomerView } from '@/server/domain/views';
import { staffRoute } from '@/server/http';
import type { CashierCustomerDto } from '@/lib/contracts/dto';

/** One customer as the cashier sees them: card, what is allowed today, vouchers waiting (CA-04, CA-09, CA-11). */
export const GET = staffRoute({ permission: 'customers.search', params: z.object({ id: z.uuid() }) }, async ({ staff, params }): Promise<CashierCustomerDto> =>
  cashierCustomerView(db(), { customerId: params.id, role: staff.staff.role, now: new Date() }));
