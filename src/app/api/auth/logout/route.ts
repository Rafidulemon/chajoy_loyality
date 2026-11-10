import { endSession, readCustomerSession, readStaffSession, revokeAllSessions } from '@/server/auth/session';
import { publicRoute } from '@/server/http';
import { logoutRequest } from '@/lib/contracts/schemas';

/** Signs out. Safe to call when nobody is signed in. With `everywhere`, every device of that person is signed out (MG-21). */
export const POST = publicRoute({ body: logoutRequest }, async ({ body }) => {
  if (body.everywhere) {
    if (body.scope === 'customer') {
      const s = await readCustomerSession();
      if (s) await revokeAllSessions({ customerId: s.customerId });
    } else {
      const s = await readStaffSession();
      if (s) await revokeAllSessions({ staffId: s.staff.id });
    }
  }
  await endSession(body.scope);
  return { ok: true };
});
