import { z } from 'zod';
import { endSession } from '@/server/auth/session';
import { db } from '@/server/db';
import { eraseCustomer } from '@/server/domain/customers';
import { customerRoute } from '@/server/http';

/** A customer asks for their data to be deleted (BR-25). Wipes their name, number and birthday, closes the account and signs them out. */
export const POST = customerRoute({ body: z.object({ confirm: z.literal(true) }) }, async ({ customer, requestId }) => {
  await db().$transaction((tx) => eraseCustomer(tx, customer.customerId, { requestId, actor: { type: 'CUSTOMER', id: customer.customerId } }));
  await endSession('customer');
  return { ok: true };
});
