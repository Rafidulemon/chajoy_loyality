import { db } from '@/server/db';
import { publicRoute } from '@/server/http';

/** For uptime monitors (NF-05, NF-10): 200 when the app can reach its database. */
export const GET = publicRoute({}, async () => {
  const started = Date.now();
  await db().$queryRaw`SELECT 1`;
  return { ok: true, db: 'up', dbMs: Date.now() - started, time: new Date().toISOString() };
});
