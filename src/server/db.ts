import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { env } from './env';

/** The transaction handle Prisma gives inside `db().$transaction(async (tx) => ...)`. Domain functions take it so they join the caller's transaction. */
export type Tx = Prisma.TransactionClient;
export { Prisma };

const globalForPrisma = globalThis as unknown as { __chajoyDb?: PrismaClient };

/**
 * Neon strings say sslmode=require. The pg driver treats that as verify-full today but will change meaning in its next
 * major version, so ask for verify-full explicitly. Local databases (tests against a local Postgres) keep what they have.
 */
function connectionString(url: string, schema?: string): string {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  if (!local && u.searchParams.get('sslmode') !== 'disable') u.searchParams.set('sslmode', 'verify-full');
  // Tests only: Prisma's own queries are schema-qualified by the adapter option below, but raw SQL ($queryRaw, FOR UPDATE
  // locks) uses the connection's search_path, so set that too. Needs a direct connection, not a transaction pooler.
  if (schema) u.searchParams.set('options', `-c search_path=${schema}`);
  return u.toString();
}

function create(): PrismaClient {
  const e = env();
  const adapter = new PrismaPg(
    {
      connectionString: connectionString(e.DATABASE_URL, e.DATABASE_SCHEMA),
      // Each serverless instance holds a few connections; the pooled Neon endpoint multiplexes them.
      max: e.DB_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    },
    e.DATABASE_SCHEMA ? { schema: e.DATABASE_SCHEMA } : undefined,
  );
  return new PrismaClient({ adapter, log: e.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
}

/**
 * The one Prisma client of this process. Created on first use (not at import, so a build without a database works)
 * and kept on globalThis so Next's hot reload in development does not open a new pool on every edit.
 */
export function db(): PrismaClient {
  if (!globalForPrisma.__chajoyDb) globalForPrisma.__chajoyDb = create();
  return globalForPrisma.__chajoyDb;
}

/** Closes the pool. Scripts (seed, tests) call this so the process can exit. */
export async function closeDb() {
  await globalForPrisma.__chajoyDb?.$disconnect();
  globalForPrisma.__chajoyDb = undefined;
}

/** Takes a row lock on a customer's card, which serialises everything that changes that customer's stamps and vouchers. Always lock the card first. */
export async function lockCard(tx: Tx, customerId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Card" WHERE "customerId" = ${customerId}::uuid FOR UPDATE`;
  return rows[0]?.id ?? null;
}

/** True for Prisma's "unique constraint failed", optionally for a given target (column or index name fragment). */
export function isUniqueViolation(e: unknown, target?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  if (!target) return true;
  const meta = e.meta as { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } } } | undefined;
  const hay = JSON.stringify(meta ?? {});
  return hay.includes(target);
}
