import { QR_TTL_SEC, signMemberQr } from '@/server/auth/qr';
import { customerRoute } from '@/server/http';

/** A signed member QR that works for 90 seconds (NF-07). The card page asks for a new one every minute. */
export const GET = customerRoute({}, async ({ customer }) => {
  const { token, expiresAt } = signMemberQr(customer.customerId);
  return { token, expiresAt: expiresAt.toISOString(), refreshInSec: Math.floor(QR_TTL_SEC * 0.66) };
});
