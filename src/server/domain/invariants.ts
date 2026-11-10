import 'server-only';
import type { Tx } from '../db';

/**
 * Checks that the counters on every card agree with the ledger and the vouchers they are meant to summarise. The counters
 * are a cache of the ledger, so after any sequence of operations, in any order, these must all hold:
 *
 *   lifetimeStamps = sum of every ledger entry                  (nothing counted twice or lost)
 *   rewardsEarned  = number of card reward vouchers issued
 *   stamps         = lifetimeStamps - stamps used up by those vouchers, and 0 <= stamps < stamps per card
 *   visits         = number of visit rows                       (one per customer, outlet and day)
 *
 * Run by the tests after concurrent and repeated operations, by `npm run db:verify` against a real database, and cheap
 * enough to run from a nightly job later.
 */
export type LedgerViolation = {
  customerId: string;
  problem: string;
  card: { stamps: number; lifetimeStamps: number; rewardsEarned: number; visits: number };
  ledger: { lifetime: number; cardVouchers: number; consumed: number; visitRows: number };
};

type Row = {
  customerId: string;
  stamps: number;
  lifetimeStamps: number;
  rewardsEarned: number;
  visits: number;
  required: number;
  ledgerLifetime: number;
  cardVouchers: number;
  consumed: number;
  visitRows: number;
};

export async function verifyLedger(tx: Tx): Promise<LedgerViolation[]> {
  const rows = await tx.$queryRaw<Row[]>`
    WITH entries AS (
      SELECT "customerId", COALESCE(SUM("count"), 0)::int AS lifetime FROM "StampEntry" GROUP BY "customerId"
    ), vouchers AS (
      SELECT "customerId",
             COUNT(*) FILTER (WHERE "source" = 'CARD')::int AS cards,
             COALESCE(SUM("stampsConsumed") FILTER (WHERE "source" = 'CARD'), 0)::int AS consumed
      FROM "Voucher" GROUP BY "customerId"
    ), visits AS (
      SELECT "customerId", COUNT(*)::int AS n FROM "Visit" GROUP BY "customerId"
    )
    SELECT c."customerId", c."stamps", c."lifetimeStamps", c."rewardsEarned", c."visits",
           p."stampsRequired" AS "required",
           COALESCE(e.lifetime, 0) AS "ledgerLifetime",
           COALESCE(v.cards, 0) AS "cardVouchers",
           COALESCE(v.consumed, 0) AS "consumed",
           COALESCE(vi.n, 0) AS "visitRows"
    FROM "Card" c
    CROSS JOIN "Program" p
    LEFT JOIN entries e ON e."customerId" = c."customerId"
    LEFT JOIN vouchers v ON v."customerId" = c."customerId"
    LEFT JOIN visits vi ON vi."customerId" = c."customerId"
  `;

  const out: LedgerViolation[] = [];
  for (const r of rows) {
    const problems: string[] = [];
    if (r.lifetimeStamps !== r.ledgerLifetime) problems.push(`lifetimeStamps ${r.lifetimeStamps} but the ledger adds up to ${r.ledgerLifetime}`);
    if (r.rewardsEarned !== r.cardVouchers) problems.push(`rewardsEarned ${r.rewardsEarned} but ${r.cardVouchers} card vouchers exist`);
    if (r.stamps !== r.lifetimeStamps - r.consumed) problems.push(`stamps ${r.stamps} but lifetime minus used up is ${r.lifetimeStamps - r.consumed}`);
    if (r.stamps < 0 || r.stamps >= r.required) problems.push(`stamps ${r.stamps} is outside 0..${r.required - 1}`);
    if (r.visits !== r.visitRows) problems.push(`visits ${r.visits} but ${r.visitRows} visit rows exist`);
    if (problems.length) {
      out.push({
        customerId: r.customerId,
        problem: problems.join('; '),
        card: { stamps: r.stamps, lifetimeStamps: r.lifetimeStamps, rewardsEarned: r.rewardsEarned, visits: r.visits },
        ledger: { lifetime: r.ledgerLifetime, cardVouchers: r.cardVouchers, consumed: r.consumed, visitRows: r.visitRows },
      });
    }
  }
  return out;
}
