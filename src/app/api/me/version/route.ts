import { db } from '@/server/db';
import { customerRoute } from '@/server/http';

/**
 * A tiny number that changes whenever anything on the customer's screen could have changed: their card, the program, or the
 * offers. The app asks for this every few seconds and loads the wallet only when it moves, so a stamp added at the counter
 * shows up within seconds (NF-04) without every phone downloading the wallet on every tick.
 */
export const GET = customerRoute({}, async ({ customer }) => {
  const [card, program, offers] = await Promise.all([
    db().card.findUnique({ where: { customerId: customer.customerId }, select: { version: true } }),
    db().program.findUniqueOrThrow({ where: { id: 1 }, select: { version: true } }),
    db().offer.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
  ]);
  return { v: `${card?.version ?? 0}.${program.version}.${offers._max.updatedAt?.getTime() ?? 0}.${offers._count._all}` };
});
