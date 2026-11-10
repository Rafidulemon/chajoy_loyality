/**
 * Creates the first owner account, on any database including production (the demo seed makes no accounts there):
 *
 *   npm run db:create-owner -- --phone 01712345678 --name "Rafiq"
 *
 * The PIN is generated here and printed once. It is stored only as a salted hash, so it cannot be read back later. The owner
 * signs in at /staff/login with the PIN and then a one-time code sent by SMS, and should change the PIN in Settings.
 *
 * Run it again with --reset-pin for an owner who has forgotten the PIN: it makes a new one, clears a lockout and signs the
 * owner out everywhere. It only ever touches owner accounts: a cashier or manager is managed by the owner in the Staff screen.
 */
import { parseArgs } from 'node:util';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { closeDb } from '@/server/db';
import { ensureOwner } from '@/server/domain/admin-staff';
import { normalizePhone } from '@/lib/domain/phone';

async function main() {
  const { values } = parseArgs({
    options: { phone: { type: 'string' }, name: { type: 'string' }, 'reset-pin': { type: 'boolean', default: false } },
  });
  const phone = normalizePhone(values.phone ?? '');
  if (!phone) throw new Error('Give a valid Bangladeshi mobile number, for example: --phone 01712345678');

  const result = await ensureOwner({ phone, name: values.name, resetPin: values['reset-pin'] });
  console.log(result.created ? `Owner created: ${result.name} (${phone})` : `New PIN set for the owner ${result.name} (${phone})`);
  console.log(`PIN: ${result.pin}`);
  console.log('Write the PIN down now: it is not stored anywhere and cannot be shown again. Sign in at /staff/login.');
}

main()
  .catch((e) => {
    // The domain function's errors carry a code and, for bad input, the fields that are wrong: say both, in terms of this command.
    const { code, details } = e as { code?: string; details?: { issues?: { message: string }[] } };
    const issues = details?.issues?.map((i) => i.message).join('; ');
    const hint = code === 'PHONE_TAKEN' ? ' Add --reset-pin to give an existing owner a new PIN.' : '';
    console.error(`${e instanceof Error ? e.message : String(e)}${issues ? `: ${issues}` : ''}.${hint}`.replace(/\.\.$/, '.'));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
