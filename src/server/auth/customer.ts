import 'server-only';
import { db } from '../db';
import { AppError } from '../errors';
import { createCustomer } from '../domain/customers';
import { consumeOtp, issueOtp, type IssuedOtp } from './otp';
import { startCustomerSession } from './session';

/**
 * Customer sign-in (CU-01, BR-16): a phone number and the 6-digit code sent to it. There is no separate sign-up:
 * a number that has no card gets one (with the welcome stamp) the first time its code is confirmed, and is sent to the
 * profile step. Asking for a code never reveals whether a number already has a card.
 */

export async function requestCustomerCode(input: { phone: string; ipHash: string | null }): Promise<IssuedOtp> {
  return issueOtp({ purpose: 'CUSTOMER_LOGIN', phone: input.phone, ipHash: input.ipHash });
}

export async function completeCustomerLogin(input: {
  challengeId: string;
  code: string;
  language?: 'bn' | 'en';
  ipHash: string | null;
  userAgent: string | null;
}): Promise<{ customerId: string; isNew: boolean; profileComplete: boolean }> {
  const { phone } = await consumeOtp({ purpose: 'CUSTOMER_LOGIN', challengeId: input.challengeId, code: input.code });

  const find = async () => {
    const customer = await db().customer.findUnique({ where: { phone } });
    return customer && !customer.deletedAt ? customer : null;
  };

  let customer = await find();
  let isNew = false;
  if (!customer) {
    try {
      const created = await db().$transaction((tx) => createCustomer(tx, { phone, joinedVia: 'APP', language: input.language === 'bn' ? 'BN' : 'EN' }));
      customer = created.customer;
      isNew = true;
    } catch (e) {
      // Another request created the same number a moment ago: use that card.
      if (e instanceof AppError && e.code === 'PHONE_TAKEN') customer = await find();
      else throw e;
    }
  }
  if (!customer) throw new AppError('INTERNAL', 500, 'Could not open the card');

  await startCustomerSession(customer.id, { ipHash: input.ipHash, userAgent: input.userAgent });
  return { customerId: customer.id, isNew, profileComplete: customer.profileCompletedAt !== null };
}
