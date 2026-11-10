import type { ErrorCode } from '@/lib/contracts/errors';
import type { Text } from '@/lib/i18n';
import { ApiError, isApiError } from './client';

const t = (bn: string, en: string): Text => ({ bn, en });

/** What a person reads for each error code. Every message exists in Bangla and English. Codes not listed fall back to a general message. */
const MESSAGES: Partial<Record<ErrorCode | 'NETWORK', Text>> = {
  NETWORK: t('ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।', 'No connection. Check your internet and try again.'),
  INTERNAL: t('আমাদের দিকে একটি সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।', 'Something went wrong on our side. Please try again in a moment.'),
  VALIDATION: t('দেওয়া তথ্যে ভুল আছে। দেখে আবার চেষ্টা করুন।', 'Some of the details are not right. Check them and try again.'),
  BAD_REQUEST: t('অনুরোধটি বোঝা যায়নি।', 'That request could not be understood.'),
  BAD_ORIGIN: t('এই অনুরোধ নিরাপদ নয়, তাই বাতিল করা হয়েছে।', 'That request was refused for safety.'),
  UNAUTHENTICATED: t('আবার লগইন করুন।', 'Please sign in again.'),
  FORBIDDEN: t('এই কাজ করার অনুমতি আপনার নেই।', 'You are not allowed to do this.'),
  NOT_FOUND: t('খুঁজে পাওয়া যায়নি।', 'Not found.'),
  CONFLICT: t('একই সময়ে অন্য কিছু বদলে গেছে। আবার চেষ্টা করুন।', 'Something else changed at the same moment. Please try again.'),
  RATE_LIMITED: t('অনেকবার চেষ্টা করা হয়েছে। একটু পরে আবার চেষ্টা করুন।', 'Too many attempts. Please try again in a while.'),
  INVALID_CREDENTIALS: t('মোবাইল নম্বর বা PIN ঠিক নয়।', 'The mobile number or PIN is not right.'),
  ACCOUNT_LOCKED: t('অনেকবার ভুল PIN দেওয়া হয়েছে, তাই অ্যাকাউন্ট কিছুক্ষণের জন্য বন্ধ।', 'Too many wrong PINs, so the account is locked for a little while.'),
  OTP_INVALID: t('কোডটি ঠিক নয় বা মেয়াদ শেষ। নতুন কোড চান।', 'That code is not right or has expired. Ask for a new one.'),
  OTP_TOO_MANY_ATTEMPTS: t('অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড চান।', 'Too many wrong codes. Ask for a new one.'),
  OTP_RATE_LIMITED: t('একটু অপেক্ষা করে আবার কোড চান।', 'Wait a moment before asking for another code.'),
  DAILY_LIMIT_REACHED: t('আজকের Stamp-এর সীমা শেষ।', 'The daily stamp limit is reached.'),
  EXCEEDS_CARD: t('কার্ড পূর্ণ করতে এতগুলো Stamp লাগবে না।', 'The card does not need that many stamps.'),
  OVERRIDE_NOT_APPROVED: t('এটি কোনো ম্যানেজারের PIN নয়।', 'That is not a manager PIN.'),
  UNDO_NOT_ALLOWED: t('এই Stamp আর বাতিল করা যাবে না। ম্যানেজারকে দিয়ে ঠিক করান।', 'These stamps cannot be undone any more. Ask a manager to adjust them.'),
  STAMPS_BELOW_ZERO: t('কার্ডে এর চেয়ে কম Stamp থাকতে পারে না।', 'A card cannot have fewer than 0 stamps.'),
  IDEMPOTENCY_KEY_REUSED: t('অনুরোধটি আগেই ব্যবহার হয়েছে। আবার চেষ্টা করুন।', 'That request was already used. Please try again.'),
  QR_INVALID: t('এই QR কোডটি ঠিক নয় বা মেয়াদ শেষ। গ্রাহককে নতুন করে দেখাতে বলুন।', 'This QR code is not valid or has expired. Ask the customer to refresh it.'),
  VOUCHER_NOT_FOUND: t('এই কোডের কোনো ভাউচার নেই।', 'No voucher with that code.'),
  VOUCHER_USED: t('এই ভাউচার আগেই ব্যবহার করা হয়েছে।', 'This voucher was already used.'),
  VOUCHER_EXPIRED: t('এই ভাউচারের মেয়াদ শেষ।', 'This voucher has expired.'),
  ITEM_REQUIRED: t('কোন আইটেমটি দেবেন তা বেছে নিন।', 'Pick which item to give.'),
  ITEM_NOT_ALLOWED: t('এই আইটেমটি ভাউচারে নেই।', 'That item is not on this voucher.'),
  OFFER_NOT_FOUND: t('অফারটি আর নেই।', 'That offer is no longer available.'),
  OFFER_NOT_CLAIMABLE: t('এই অফার কাউন্টারে দেখাতে হয়, অ্যাপে নেওয়া যায় না।', 'This offer is shown at the counter and cannot be claimed in the app.'),
  OFFER_ENDED: t('অফারটির সময় শেষ।', 'This offer has ended.'),
  ALREADY_CLAIMED: t('আপনি এই অফার আগেই নিয়েছেন।', 'You already claimed this offer.'),
  PHONE_TAKEN: t('এই নম্বরে আগে থেকেই কার্ড আছে।', 'This number already has a card.'),
  PROFILE_INCOMPLETE: t('আগে প্রোফাইল সম্পূর্ণ করুন।', 'Finish your profile first.'),
  VERSION_CONFLICT: t('অন্য কেউ এটি বদলে দিয়েছেন। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।', 'Someone else changed this. Refresh the page and try again.'),
  SMS_BALANCE_LOW: t('SMS ব্যালেন্স যথেষ্ট নয়।', 'There is not enough SMS balance.'),
  NO_RECIPIENTS: t('এই গ্রুপে কেউ অফার SMS পেতে রাজি নেই।', 'Nobody in this group has agreed to receive offer SMS.'),
};

/** The message to show for an error, in both languages. Falls back to a general message for anything unexpected. */
export function errorText(e: unknown): Text {
  const code = isApiError(e) ? e.code : undefined;
  return (code && MESSAGES[code]) || MESSAGES.INTERNAL!;
}

/** Seconds to wait, when the server said so (429). */
export const retryAfter = (e: unknown): number | undefined => (e instanceof ApiError ? e.retryAfter : undefined);

/** True when the person is simply not signed in (any more), so the app should send them to the sign-in screen. */
export const isSignedOut = (e: unknown) => isApiError(e) && e.status === 401;
