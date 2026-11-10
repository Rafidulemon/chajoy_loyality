import { z } from 'zod';
import { db } from '@/server/db';
import { customerActivity } from '@/server/domain/activity';
import { staffRoute } from '@/server/http';
import { historyQuery } from '@/lib/contracts/schemas';

/** More of a customer's timeline, for management: stamps with who gave them, where and why. Page with `before`. */
export const GET = staffRoute({ permission: 'customers.list', params: z.object({ id: z.uuid() }), query: historyQuery }, async ({ params, query }) =>
  customerActivity(db(), { customerId: params.id, before: query.before ? new Date(query.before) : undefined, limit: query.limit, audience: 'staff' }));
