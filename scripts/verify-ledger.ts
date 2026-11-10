/**
 * Checks every card against the ledger and the vouchers (see src/server/domain/invariants.ts).
 * Run: npm run db:verify. Exits with 1 and lists the customers when something does not add up.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { closeDb, db } from '@/server/db';
import { verifyLedger } from '@/server/domain/invariants';

async function main() {
  const [cards, entries, vouchers] = await Promise.all([db().card.count(), db().stampEntry.count(), db().voucher.count()]);
  const violations = await verifyLedger(db());
  console.log(`checked ${cards} cards, ${entries} ledger entries, ${vouchers} vouchers`);
  if (violations.length === 0) {
    console.log('ledger OK: every counter matches the ledger');
    return;
  }
  for (const v of violations) console.error(`customer ${v.customerId}: ${v.problem}`);
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
