import { completeCustomerLogin } from '@/server/auth/customer';
import { publicRoute } from '@/server/http';
import { customerOtpVerify } from '@/lib/contracts/schemas';

/** Step two: confirm the code. Signs the customer in (cookie) and opens a card if this number has none. */
export const POST = publicRoute({ body: customerOtpVerify }, async ({ body, ipHash, userAgent }) => {
  const { isNew, profileComplete } = await completeCustomerLogin({ ...body, ipHash, userAgent });
  return { isNew, profileComplete };
});
