import { requestCustomerCode } from '@/server/auth/customer';
import { env } from '@/server/env';
import { publicRoute } from '@/server/http';
import { customerOtpRequest } from '@/lib/contracts/schemas';

/**
 * Step one of customer sign-in: send a code to a phone number. The answer is the same whether or not the number has a card.
 * `mode` is "fixed" only in development (everyone uses DEV_OTP_CODE), so the sign-in screen can say so; production never answers "fixed".
 */
export const POST = publicRoute({ body: customerOtpRequest }, async ({ body, ipHash }) => ({
  ...(await requestCustomerCode({ phone: body.phone, ipHash })),
  mode: env().OTP_MODE,
}));
