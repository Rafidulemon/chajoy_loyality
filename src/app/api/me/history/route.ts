import { db } from '@/server/db';
import { customerActivity } from '@/server/domain/activity';
import { customerRoute } from '@/server/http';
import { historyQuery } from '@/lib/contracts/schemas';
import type { HistoryDto } from '@/lib/contracts/dto';

/** The customer's stamp and reward history, newest first. Page with `before` (the `nextBefore` of the previous page). */
export const GET = customerRoute({ query: historyQuery }, async ({ customer, query }): Promise<HistoryDto> => {
  const [page, card] = await Promise.all([
    customerActivity(db(), { customerId: customer.customerId, before: query.before ? new Date(query.before) : undefined, limit: query.limit, audience: 'customer' }),
    db().card.findUniqueOrThrow({ where: { customerId: customer.customerId }, select: { lifetimeStamps: true, rewardsEarned: true } }),
  ]);
  return { items: page.items, lifetimeStamps: card.lifetimeStamps, rewardsEarned: card.rewardsEarned, nextBefore: page.nextBefore };
});
