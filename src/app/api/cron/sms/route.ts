import { env } from '@/server/env';
import { safeEqual } from '@/server/crypto';
import { fail } from '@/server/errors';
import { processDueCampaigns } from '@/server/domain/admin-sms';
import { publicRoute } from '@/server/http';

/**
 * Called by the scheduler (Vercel Cron, every few minutes): sends campaigns whose time has come and finishes any that were left
 * half sent. Off unless CRON_SECRET is set, and then it needs `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST = publicRoute({}, async ({ req }) => {
  const secret = env().CRON_SECRET;
  if (!secret) throw fail.notFound('This route');
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(given, secret)) throw fail.unauthenticated();
  return { processed: await processDueCampaigns() };
});

/** Vercel Cron sends GET requests. */
export const GET = POST;
