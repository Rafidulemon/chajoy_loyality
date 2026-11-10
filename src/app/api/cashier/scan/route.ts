import { db } from '@/server/db';
import { verifyMemberQr } from '@/server/auth/qr';
import { fail } from '@/server/errors';
import { staffRoute } from '@/server/http';
import { scanRequest } from '@/lib/contracts/schemas';

/** The cashier's camera reads a customer's QR and sends the token here (CA-01). The server checks the signature and the 90 second expiry (NF-07). */
export const POST = staffRoute({ permission: 'counter.work', body: scanRequest }, async ({ body }) => {
  const customerId = verifyMemberQr(body.token);
  const customer = await db().customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } });
  if (!customer) throw fail.notFound('Customer');
  return { customerId: customer.id };
});
