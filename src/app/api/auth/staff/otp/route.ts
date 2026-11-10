import { completeStaffLogin } from '@/server/auth/staff';
import { publicRoute } from '@/server/http';
import { staffOtpVerify } from '@/lib/contracts/schemas';

/** Staff sign-in, step two for managers and owners: the code sent after the PIN. */
export const POST = publicRoute({ body: staffOtpVerify }, async ({ body, ipHash, userAgent }) => {
  await completeStaffLogin({ ...body, ipHash, userAgent });
  return { status: 'ok' as const };
});
