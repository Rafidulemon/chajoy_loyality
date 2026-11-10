import { loginWithPin } from '@/server/auth/staff';
import { env } from '@/server/env';
import { publicRoute } from '@/server/http';
import { staffLogin } from '@/lib/contracts/schemas';

/** Staff sign-in, step one: phone number and PIN. Cashiers are signed in; managers and owners are asked for an SMS code next. */
export const POST = publicRoute({ body: staffLogin }, async ({ body, ipHash, userAgent }) => {
  const result = await loginWithPin({ ...body, ipHash, userAgent });
  return result.status === 'ok'
    ? { status: 'ok' as const }
    : { status: 'otp_required' as const, challengeId: result.challengeId, expiresInSec: result.expiresInSec, resendAfterSec: result.resendAfterSec, mode: env().OTP_MODE };
});
