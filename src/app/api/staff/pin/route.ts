import { changeOwnPin } from '@/server/auth/staff';
import { staffRoute } from '@/server/http';
import { changePin } from '@/lib/contracts/schemas';

/** A staff member changes their own PIN. Needs the current one; other devices are signed out. */
export const POST = staffRoute({ body: changePin }, async ({ staff, body }) => {
  await changeOwnPin({ staffId: staff.staff.id, sessionId: staff.sessionId, currentPin: body.currentPin, newPin: body.newPin });
  return { ok: true };
});
