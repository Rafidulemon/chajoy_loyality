/**
 * What the API sends and receives. Plain JSON: dates are ISO 8601 strings in UTC, ids are UUIDs, text that management
 * writes is a { bn, en } pair. The apps turn these into the display types in src/lib/data.ts (see src/lib/api/adapters.ts),
 * so the server never sends pre-formatted text such as "2 days ago".
 */

export type Iso = string;
export type TextPair = { bn: string; en: string };
export type Lang = 'bn' | 'en';
export type StaffRoleDto = 'cashier' | 'manager' | 'owner';

// ---------------------------------------------------------------------------------------------
// Program, outlets, offers
// ---------------------------------------------------------------------------------------------

export type ProgramDto = {
  name: TextPair;
  /** Stamps that earn a reward. */
  total: number;
  /** Reward item ids offered right now (catalogue in src/lib/program.ts). */
  items: string[];
  minPurchase: number;
  /** 0 means no limit. */
  dailyLimit: number;
  /** 0 means never. */
  expiryDays: number;
  welcome: boolean;
  /** Card colour id (catalogue in src/lib/program.ts). */
  color: string;
  /** Bumped on every save: send it back with an edit so two editors cannot overwrite each other. */
  version: number;
};

export type BranchDto = {
  id: string;
  slug: string;
  name: TextPair;
  address: TextPair;
  lat: number;
  lng: number;
  /** Minutes after midnight, Dhaka time. */
  openMinute: number;
  closeMinute: number;
  main: boolean;
  chip: string;
  active: boolean;
};

export type OfferKindDto = 'double' | 'stamp' | 'voucher' | 'info' | 'birthday';
export type OfferStatusDto = 'live' | 'paused';

export type OfferDto = {
  id: string;
  kind: OfferKindDto;
  status: OfferStatusDto;
  badge: TextPair;
  title: TextPair;
  body: TextPair;
  terms: TextPair[];
  bonusStamps: number | null;
  reward: TextPair | null;
  voucherDays: number | null;
  bg: string;
  fg: string;
  startsAt: Iso;
  /** Null for an offer with no end date. */
  endsAt: Iso | null;
  /** How many customers claimed it. Only management sees this. */
  claims?: number;
};

// ---------------------------------------------------------------------------------------------
// Cards and vouchers
// ---------------------------------------------------------------------------------------------

export type CardDto = {
  stamps: number;
  visits: number;
  lifetimeStamps: number;
  rewardsEarned: number;
  lastVisitAt: Iso | null;
  version: number;
};

export type VoucherStatusDto = 'ready' | 'used' | 'expired';

export type VoucherDto = {
  id: string;
  code: string;
  title: TextPair;
  /** Where it came from, as text ("Card completed", "Offer: Free topping"). */
  source: TextPair;
  /** From a full card, or from a claimed offer. */
  origin: 'card' | 'offer';
  issuedAt: Iso;
  expiresAt: Iso;
  redeemedAt: Iso | null;
  status: VoucherStatusDto;
  /** Items the customer picks from at the counter. Empty when there is no choice. */
  choices: { id: string; name: TextPair }[];
  /** What was handed over, once redeemed. */
  chosen: TextPair | null;
};

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

export type MeDto = {
  id: string;
  memberNo: number;
  name: string | null;
  /** E.164, "+8801712345678". */
  phone: string;
  /** "YYYY-MM-DD" or null. */
  birthday: string | null;
  smsConsent: boolean;
  language: Lang;
  joinedAt: Iso;
  /** False until the name has been given on the setup screen. */
  profileComplete: boolean;
};

/** Everything the customer app shows, in one response: the card, vouchers, live offers and the program. */
export type WalletDto = {
  me: MeDto;
  card: CardDto;
  program: ProgramDto;
  vouchers: VoucherDto[];
  claimedOfferIds: string[];
  /** Live offers (not paused, not ended). */
  offers: OfferDto[];
  serverTime: Iso;
};

export type ActivityKind = 'stamp' | 'undo' | 'adjust' | 'welcome' | 'offer-bonus' | 'reward-unlocked' | 'reward-redeemed' | 'joined';

/** One event on a customer's timeline: a stamp, a reward, joining. Built from the ledger and vouchers, never stored twice. */
export type ActivityDto = {
  id: string;
  at: Iso;
  kind: ActivityKind;
  /** Stamps added (negative when taken away). */
  count?: number;
  /** Reward title for reward events, offer title for offer bonuses. */
  title?: TextPair | null;
  /** The item handed over, for a redemption. */
  item?: TextPair | null;
  /** Manager's reason for an adjustment. */
  reason?: string | null;
  branch?: TextPair | null;
  staffName?: string | null;
};

export type HistoryDto = { items: ActivityDto[]; lifetimeStamps: number; rewardsEarned: number; nextBefore: Iso | null };

export type NotificationKindDto = 'welcome' | 'reward-unlocked' | 'reward-redeemed' | 'offer-claimed';

/** The text is built in the app from kind and params, so it follows the language setting. */
export type NotificationDto = { id: string; kind: NotificationKindDto; params: Record<string, unknown>; createdAt: Iso; read: boolean };

export type NotificationsDto = { items: NotificationDto[]; unread: number };

export type CustomerStatusDto = 'active' | 'ready' | 'inactive';

/** A customer in a list: the cashier's Customers tab and management's customer table. */
export type CustomerRowDto = {
  id: string;
  memberNo: number;
  name: string | null;
  /** Masked for cashiers ("+880 17XX-XXX678"), full for management. */
  phone: string;
  stamps: number;
  visits: number;
  rewardsEarned: number;
  lastVisitAt: Iso | null;
  joinedAt: Iso;
  hasReadyVoucher: boolean;
  status: CustomerStatusDto;
};

export type FeedItemDto = ActivityDto & { customer: { id: string; name: string | null }; staff: { id: string; name: string } | null };

// ---------------------------------------------------------------------------------------------
// Cashier
// ---------------------------------------------------------------------------------------------

export type StaffMeDto = {
  id: string;
  name: string;
  role: StaffRoleDto;
  phone: string;
  /** The outlet this session works at (cashier app). Null for a manager or owner who has not picked one. */
  branch: BranchDto | null;
  /** Outlets this person may work at. Empty for an owner, who may pick any. */
  allowedBranchIds: string[];
};

export type CashierCustomerDto = {
  customer: CustomerRowDto;
  card: CardDto;
  program: ProgramDto;
  /** Stamps from purchases already given today (Dhaka time). */
  givenToday: number;
  /** Stamps still allowed today, or null when the program has no daily limit. */
  roomToday: number | null;
  readyVouchers: VoucherDto[];
};

export type StampResultDto = {
  entryId: string;
  added: number;
  card: CardDto;
  /** Cards this action filled (0 or 1 at the counter). */
  completed: number;
  /** The vouchers issued by this action. */
  vouchers: VoucherDto[];
  givenToday: number;
  /** True when the same request had already been applied (a retry): nothing was added twice. */
  replayed: boolean;
};

export type TodayDto = { stamps: number; rewards: number; newCustomers: number; cancelled: number; feed: FeedItemDto[] };

export type VoucherLookupDto = { voucher: VoucherDto; customer: { id: string; name: string | null; memberNo: number } };

export type RedeemResultDto = { voucher: VoucherDto; card: CardDto };
