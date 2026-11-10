/**
 * Management app: what the /api/admin routes send. Same conventions as dto.ts (ISO dates, { bn, en } pairs).
 */
import type { ActivityDto, BranchDto, CardDto, CustomerRowDto, FeedItemDto, Iso, OfferDto, ProgramDto, StaffRoleDto, TextPair } from './dto';

// ---------------------------------------------------------------------------------------------
// Dashboard (MG-01, MG-02)
// ---------------------------------------------------------------------------------------------

export type DashboardDto = {
  /** The outlets the numbers cover, or null for all of them. A manager sees their own outlets only. */
  branchIds: string[] | null;
  totals: {
    customers: number;
    /** Joined in the last 30 days. */
    newCustomers: number;
    /** Net stamps in the last 30 days, and in the 30 days before that, for the "vs previous" note. */
    stamps: number;
    stampsPrevious: number;
    rewardsRedeemed: number;
    /** Members with a visit in the last 30 days. */
    activeMembers: number;
    /** Members with 2+ visits in the last 30 days, divided by active members (0 to 1). */
    returnRate: number;
  };
  /** The last 7 days in Dhaka, oldest first. `day` is "YYYY-MM-DD". */
  weeklyVisits: { day: string; visits: number }[];
  /** The reward items customers chose most in the last 30 days. */
  popularRewards: { id: string; name: TextPair; count: number }[];
  topCustomers: { id: string; name: string | null; visits: number }[];
  recent: FeedItemDto[];
  sms: { balance: number; usedThisMonth: number };
  offers: { live: number; paused: number; claims: number };
};

// ---------------------------------------------------------------------------------------------
// Customers (MG-04 to MG-07)
// ---------------------------------------------------------------------------------------------

export type CustomerSegment = 'all' | 'active' | 'ready' | 'inactive';

export type AdminCustomerListDto = {
  items: CustomerRowDto[];
  /** Customers matching the segment and search. */
  total: number;
  page: number;
  pageSize: number;
  /** Size of each group, for the tabs (they do not depend on the search). */
  counts: Record<CustomerSegment, number>;
};

export type AdminCustomerDto = {
  row: CustomerRowDto;
  profile: {
    birthday: string | null;
    smsConsent: boolean;
    language: 'bn' | 'en';
    joinedAt: Iso;
    joinedVia: 'app' | 'counter' | 'management';
    joinedBranch: TextPair | null;
    /** Private note for management. */
    note: string | null;
  };
  card: CardDto;
  program: ProgramDto;
  stats: { visits: number; lifetimeStamps: number; rewardsEarned: number; averageGapDays: number | null; favouriteReward: TextPair | null };
  activity: ActivityDto[];
  nextBefore: Iso | null;
};

export type AdjustResultDto = { card: CardDto; completed: number; entryId: string };

// ---------------------------------------------------------------------------------------------
// Program (MG-08 to MG-10)
// ---------------------------------------------------------------------------------------------

export type AdminProgramDto = {
  program: ProgramDto;
  /** Whether the birthday / double-stamp offers are live. Null when no such offer exists (it was deleted). */
  birthdayOn: boolean | null;
  doubleStampOn: boolean | null;
};

/** What saving a smaller card would do (MG-09), shown before saving. */
export type ProgramImpactDto = { cards: number; vouchers: number };

export type ProgramSaveResultDto = { program: ProgramDto; completed: ProgramImpactDto; birthdayOn: boolean | null; doubleStampOn: boolean | null };

// ---------------------------------------------------------------------------------------------
// Staff and outlets (MG-17, MG-18)
// ---------------------------------------------------------------------------------------------

export type StaffRowDto = {
  id: string;
  name: string;
  phone: string;
  role: StaffRoleDto;
  active: boolean;
  branches: { id: string; name: TextPair }[];
  lastSeenAt: Iso | null;
  /** Stamps this person gave today (Dhaka time). Null for roles that do not work the counter. */
  stampsToday: number | null;
};

/** The PIN is shown once, when the account is made or reset, and is never stored in plain text. */
export type StaffSecretDto = { staff: StaffRowDto; temporaryPin: string };

export type AdminBranchDto = BranchDto & { staffCount: number; customerCount: number };

// ---------------------------------------------------------------------------------------------
// Offers (MG-12, MG-13)
// ---------------------------------------------------------------------------------------------

export type AdminOfferDto = OfferDto & { claims: number };

// ---------------------------------------------------------------------------------------------
// SMS (MG-15, MG-16)
// ---------------------------------------------------------------------------------------------

export type SmsAudienceDto = 'all' | 'lapsed' | 'reward-ready' | 'birthday-week';
export type SmsCampaignStatusDto = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export type SmsCampaignDto = {
  id: string;
  name: string;
  audience: SmsAudienceDto;
  message: string;
  unicode: boolean;
  /** SMS parts one recipient needs. */
  parts: number;
  recipients: number;
  /** recipients x parts. */
  smsNeeded: number;
  status: SmsCampaignStatusDto;
  scheduledAt: Iso | null;
  sentAt: Iso | null;
  sent: number;
  failed: number;
  /** Recipients who came to an outlet within 7 days of the send. */
  cameBack: number;
  createdAt: Iso;
};

export type SmsOverviewDto = {
  balance: number;
  usedThisMonth: number;
  /** Customers who agreed to offer SMS, per audience (BR-22). */
  audiences: Record<SmsAudienceDto, number>;
  campaigns: SmsCampaignDto[];
};
