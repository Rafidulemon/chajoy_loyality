import { db } from '@/server/db';
import { adminCustomerView, listCustomers } from '@/server/domain/admin-customers';
import { writeAudit } from '@/server/domain/audit';
import { createCustomer } from '@/server/domain/customers';
import { staffContext } from '@/server/domain/audit';
import { created, staffRoute } from '@/server/http';
import { adminCustomersQuery, createCustomerRequest } from '@/lib/contracts/schemas';
import type { AdminCustomerListDto } from '@/lib/contracts/admin';

/** The customer list with groups, search, sort and pages (MG-04). */
export const GET = staffRoute({ permission: 'customers.list', query: adminCustomersQuery }, async ({ staff, query }): Promise<AdminCustomerListDto> =>
  listCustomers(db(), { query, role: staff.staff.role, now: new Date() }));

/** Add a customer from management (MG-05). They get the welcome stamp like anyone else (BR-17). */
export const POST = staffRoute({ permission: 'customers.list', body: createCustomerRequest }, async ({ staff, body, requestId }) => {
  const now = new Date();
  const result = await db().$transaction(
    async (tx) => {
      const made = await createCustomer(tx, { phone: body.phone, name: body.name, smsConsent: body.smsConsent, joinedVia: 'MANAGEMENT', createdById: staff.staff.id, at: now });
      await writeAudit(tx, staffContext(staff, requestId), { action: 'customer.create', entityType: 'Customer', entityId: made.customer.id, at: now });
      return made;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  return created(await adminCustomerView(db(), { customerId: result.customer.id, role: staff.staff.role, now }));
});
