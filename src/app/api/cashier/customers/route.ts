import { db } from '@/server/db';
import { createCustomer, searchCustomers, todaysCustomers } from '@/server/domain/customers';
import { cashierCustomerView } from '@/server/domain/views';
import { created, staffRoute } from '@/server/http';
import { cashierCustomersQuery, createCustomerRequest } from '@/lib/contracts/schemas';
import type { CustomerRowDto } from '@/lib/contracts/dto';

/**
 * Find a customer at the counter (CA-02). With `q` it searches by the last digits of a number, a full number or a name;
 * without it it lists the customers who were served at this outlet today (CA-14). A cashier cannot browse the whole customer list.
 */
export const GET = staffRoute({ permission: 'customers.search', query: cashierCustomersQuery }, async ({ staff, query }): Promise<{ mode: 'search' | 'today'; items: CustomerRowDto[] }> => {
  const now = new Date();
  if (query.q) return { mode: 'search', items: await searchCustomers(db(), { q: query.q, limit: query.limit, role: staff.staff.role, now }) };
  const items = staff.branchId ? await todaysCustomers(db(), { branchId: staff.branchId, role: staff.staff.role, now, limit: query.limit }) : [];
  return { mode: 'today', items };
});

/** Add a new customer at the counter (CA-03). They start with the welcome stamp when the program gives one (BR-17). */
export const POST = staffRoute({ permission: 'counter.work', body: createCustomerRequest }, async ({ staff, body }) => {
  const now = new Date();
  const result = await db().$transaction(
    (tx) => createCustomer(tx, { phone: body.phone, name: body.name, smsConsent: body.smsConsent, joinedVia: 'COUNTER', createdById: staff.staff.id, branchId: staff.branchId, at: now }),
    { maxWait: 10_000, timeout: 20_000 },
  );
  return created(await cashierCustomerView(db(), { customerId: result.customer.id, role: staff.staff.role, now }));
});
