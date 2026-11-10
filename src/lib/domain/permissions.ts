/**
 * Who may do what: the staff permission matrix from section 6 of the business documentation (MG-22).
 * The server enforces it on every request; the apps use it only to hide what a person cannot use.
 */
export type StaffRole = 'CASHIER' | 'MANAGER' | 'OWNER';

const ALL: readonly StaffRole[] = ['CASHIER', 'MANAGER', 'OWNER'];
const MANAGEMENT: readonly StaffRole[] = ['MANAGER', 'OWNER'];
const OWNER_ONLY: readonly StaffRole[] = ['OWNER'];

export const PERMISSIONS = {
  /** Scan a customer, add stamps, redeem vouchers, undo a stamp just added, add a new customer. */
  'counter.work': ALL,
  /** Find a customer by number and see today's list. */
  'customers.search': ALL,
  /** Go over the daily limit directly. A cashier needs a manager's PIN instead (approveOverride). */
  'limit.override': MANAGEMENT,
  /** Adjust a customer's stamps by hand, with a reason. */
  'stamps.adjust': MANAGEMENT,
  'customers.list': MANAGEMENT,
  'offers.manage': MANAGEMENT,
  'sms.send': MANAGEMENT,
  'dashboard.view': MANAGEMENT,
  'program.edit': OWNER_ONLY,
  'staff.manage': OWNER_ONLY,
  'outlets.manage': OWNER_ONLY,
  'customers.export': OWNER_ONLY,
  'audit.view': OWNER_ONLY,
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: StaffRole, permission: Permission): boolean => (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);

/** Managers and owners see the whole customer record; cashiers see a masked phone number (NF-08). */
export const seesFullPhone = (role: StaffRole): boolean => role !== 'CASHIER';
