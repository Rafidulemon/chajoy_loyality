/**
 * Request bodies and queries, shared by the server (which validates with them) and the apps (which can validate forms
 * with the same rules). A phone number is normalised to E.164 while parsing, so everything behind it sees one form.
 */
import { z } from 'zod';
import { normalizePhone } from '@/lib/domain/phone';

const phone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalised = normalizePhone(value);
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladeshi mobile number' });
      return z.NEVER;
    }
    return normalised;
  });

const name = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(2, 'The name is too short').max(80, 'The name is too long'));

const pin = z.string().regex(/^\d{6}$/, 'The PIN is 6 digits');
const code = z.string().regex(/^\d{6}$/, 'The code is 6 digits');
const id = z.uuid();

// ---------------------------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------------------------

export const customerOtpRequest = z.object({ phone });
export const customerOtpVerify = z.object({ challengeId: id, code, language: z.enum(['bn', 'en']).optional() });

export const staffLogin = z.object({ phone, pin, branchId: id.optional() });
export const staffOtpVerify = z.object({ challengeId: id, code, branchId: id.optional() });

export const logoutRequest = z.object({ scope: z.enum(['customer', 'staff']), everywhere: z.boolean().optional() });

// ---------------------------------------------------------------------------------------------
// Customer app
// ---------------------------------------------------------------------------------------------

export const profileUpdate = z
  .object({
    name: name.optional(),
    birthday: z.iso.date().nullable().optional(),
    smsConsent: z.boolean().optional(),
    language: z.enum(['bn', 'en']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const historyQuery = z.object({ before: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) });

// ---------------------------------------------------------------------------------------------
// Cashier app
// ---------------------------------------------------------------------------------------------

/** The cashier's Customers tab: with `q` it searches, without it it lists today's customers at this outlet. */
export const cashierCustomersQuery = z.object({ q: z.string().trim().max(40).optional(), limit: z.coerce.number().int().min(1).max(30).default(15) });
export const customerListQuery = z.object({
  q: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const addStampsRequest = z.object({
  customerId: id,
  count: z.number().int().min(1).max(20),
  /** A fresh UUID per button press. Retrying the same request with the same key never stamps twice (CA-20). */
  idempotencyKey: id,
  /** A manager's or owner's PIN, to go over the daily limit (BR-02). */
  overridePin: pin.optional(),
});

export const redeemRequest = z.object({ itemId: z.string().min(1).max(64).optional() });
export const voucherCodeQuery = z.object({ code: z.string().trim().min(4).max(40) });

export const createCustomerRequest = z.object({
  name,
  phone,
  smsConsent: z.boolean().optional(),
});

export const scanRequest = z.object({ token: z.string().min(20).max(400) });

// ---------------------------------------------------------------------------------------------
// Management app
// ---------------------------------------------------------------------------------------------

export const adjustStampsRequest = z.object({
  delta: z.number().int().min(-50).max(50).refine((n) => n !== 0, 'Enter how many stamps to add or take away'),
  reason: z.string().trim().min(3, 'Give a short reason').max(200),
});

const text = (max: number) => z.object({ bn: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #97C334');

export const adminCustomersQuery = z.object({
  segment: z.enum(['all', 'active', 'ready', 'inactive']).default('all'),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(['recent', 'visits', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const customerNote = z.object({ note: z.string().max(1000).nullable() });

/** The loyalty program as management saves it (MG-08). Allowed values follow section 7 of the business documentation. */
export const programSave = z.object({
  name: text(40),
  total: z.number().int().min(4).max(20),
  items: z.array(z.string().min(1).max(40)).min(1, 'Pick at least one reward').max(12),
  minPurchase: z.number().int().min(0).max(100_000),
  dailyLimit: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  expiryDays: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]),
  welcome: z.boolean(),
  color: z.string().min(1).max(20),
  /** The version the editor started from. A save from a stale screen is refused (409) instead of overwriting someone else's change. */
  version: z.number().int().min(1),
  /** Turn the matching offers on or off together with the program (MG-10). */
  birthdayOn: z.boolean().optional(),
  doubleStampOn: z.boolean().optional(),
});

export const programImpactQuery = z.object({ total: z.coerce.number().int().min(4).max(20) });

export const offerSave = z
  .object({
    kind: z.enum(['stamp', 'voucher', 'double', 'info', 'birthday']),
    badge: text(8),
    title: text(80),
    body: text(240),
    terms: z.array(text(120)).max(6).default([]),
    bonusStamps: z.number().int().min(1).max(3).optional(),
    reward: text(60).optional(),
    voucherDays: z.number().int().min(1).max(90).optional(),
    bg: hex,
    fg: hex,
    /** Days the offer runs from now. Left out for a birthday offer, which has no end date. */
    runDays: z.number().int().min(1).max(90).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'stamp' && !v.bonusStamps) ctx.addIssue({ code: 'custom', path: ['bonusStamps'], message: 'A bonus-stamp offer needs a number of stamps' });
    if (v.kind === 'voucher' && (!v.reward || !v.voucherDays)) ctx.addIssue({ code: 'custom', path: ['reward'], message: 'A free-item offer needs a voucher name and how long it stays valid' });
    if (v.kind !== 'birthday' && !v.runDays) ctx.addIssue({ code: 'custom', path: ['runDays'], message: 'Say how many days the offer runs' });
  });

export const offerStatus = z.object({ status: z.enum(['live', 'paused']) });

export const staffCreate = z.object({
  name,
  phone,
  role: z.enum(['cashier', 'manager']),
  branchIds: z.array(id).min(1, 'Pick an outlet').max(10),
});

export const staffUpdate = z
  .object({
    name: name.optional(),
    role: z.enum(['cashier', 'manager']).optional(),
    branchIds: z.array(id).min(1).max(10).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const changePin = z.object({ currentPin: pin, newPin: pin }).refine((v) => v.currentPin !== v.newPin, 'Choose a different PIN');

export const branchHours = z
  .object({ openMinute: z.number().int().min(0).max(1439), closeMinute: z.number().int().min(1).max(1440) })
  .refine((v) => v.closeMinute > v.openMinute, 'Closing time must be after opening time');

export const smsCampaignCreate = z.object({
  name: z.string().trim().min(1).max(80),
  audience: z.enum(['all', 'lapsed', 'reward-ready', 'birthday-week']),
  message: z.string().trim().min(1).max(640),
  /** Send at this time instead of now. */
  scheduledAt: z.iso.datetime().optional(),
  offerId: id.optional(),
});

export type AdminCustomersQuery = z.infer<typeof adminCustomersQuery>;
export type ProgramSave = z.infer<typeof programSave>;
export type OfferSave = z.infer<typeof offerSave>;
export type StaffCreate = z.infer<typeof staffCreate>;
export type StaffUpdate = z.infer<typeof staffUpdate>;
export type SmsCampaignCreate = z.infer<typeof smsCampaignCreate>;

export type CustomerOtpRequest = z.infer<typeof customerOtpRequest>;
export type CustomerOtpVerify = z.infer<typeof customerOtpVerify>;
export type StaffLogin = z.infer<typeof staffLogin>;
export type StaffOtpVerify = z.infer<typeof staffOtpVerify>;
export type ProfileUpdate = z.infer<typeof profileUpdate>;
export type AddStampsRequest = z.infer<typeof addStampsRequest>;
export type RedeemRequest = z.infer<typeof redeemRequest>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequest>;
export type AdjustStampsRequest = z.infer<typeof adjustStampsRequest>;
