/**
 * API data -> the display types the screens already use (src/lib/data.ts, src/lib/program.ts).
 * The server sends plain facts (ISO dates, ids, { bn, en } text); this is the one place that turns them into
 * "7 Nov", "2 days ago", "3 days left" and avatar colours, so the screens do not each do it their own way.
 */
import type { ActivityDto, BranchDto, CustomerRowDto, FeedItemDto, OfferDto, ProgramDto, VoucherDto } from '@/lib/contracts/dto';
import type { AdminBranchDto, AdminOfferDto } from '@/lib/contracts/admin';
import type { ProgramSave } from '@/lib/contracts/schemas';
import type { ActivityType, Branch, Customer, HistoryItem, Offer, Voucher } from '@/lib/data';
import type { OfferRow } from '@/lib/offer-row';
import type { Text } from '@/lib/i18n';
import { bnDigits, avatarColor, clock, day, daysUntil, groupLabel, initialOf, nextBirthday, relativeDays } from '@/lib/format';
import { CARD_COLORS, type Program } from '@/lib/program';
import { formatPhone } from '@/lib/domain/phone';

const t = (bn: string, en: string): Text => ({ bn, en });
const ms = (iso: string) => Date.parse(iso);

export function toVoucher(v: VoucherDto, now = Date.now()): Voucher {
  return {
    id: v.id,
    code: v.code,
    title: v.title,
    source: v.source,
    earned: day(ms(v.issuedAt)),
    expires: day(ms(v.expiresAt)),
    daysLeft: v.status === 'ready' ? daysUntil(ms(v.expiresAt), now) : 0,
    status: v.status,
    usedOn: v.redeemedAt ? day(ms(v.redeemedAt)) : undefined,
    choices: v.choices.length ? v.choices.map((c) => c.name) : undefined,
    choiceIds: v.choices.length ? v.choices.map((c) => c.id) : undefined,
  };
}

/** `birthday` is the customer's own, used for the date the birthday offer unlocks. */
export function toOffer(o: OfferDto, birthday: string | null = null, now = Date.now()): Offer {
  return {
    id: o.id,
    kind: o.kind,
    badge: o.badge,
    title: o.title,
    body: o.body,
    endsInDays: o.endsAt ? daysUntil(ms(o.endsAt), now) : null,
    bonusStamps: o.bonusStamps ?? undefined,
    reward: o.reward ?? undefined,
    voucherDays: o.voucherDays ?? undefined,
    unlocksOn: o.kind === 'birthday' && birthday ? nextBirthday(birthday, now) : undefined,
    terms: o.terms,
    bg: o.bg,
    fg: o.fg,
  };
}

/** An offer as management sees it: the offer plus live/paused and how many customers claimed it. */
export function toOfferRow(o: AdminOfferDto, now = Date.now()): OfferRow {
  return { ...toOffer(o, null, now), status: o.status, claims: o.claims };
}

export function toProgram(p: ProgramDto): Program {
  return {
    name: p.name,
    total: p.total,
    items: p.items,
    minPurchase: p.minPurchase,
    dailyLimit: p.dailyLimit,
    expiryDays: p.expiryDays,
    welcome: p.welcome,
    color: Math.max(0, CARD_COLORS.findIndex((c) => c.id === p.color)),
  };
}

/** The body to send when saving the program. `version` is the one the screen started from. */
export function toProgramSave(p: Program, version: number): ProgramSave {
  return {
    name: p.name,
    total: p.total,
    items: p.items,
    minPurchase: p.minPurchase,
    dailyLimit: p.dailyLimit as ProgramSave['dailyLimit'],
    expiryDays: p.expiryDays as ProgramSave['expiryDays'],
    welcome: p.welcome,
    color: CARD_COLORS[p.color]?.id ?? CARD_COLORS[0].id,
    version,
  };
}

export type BranchView = Branch & { hours: { open: number; close: number } };

/** An outlet with its opening hours. Staff and customer counts are only known to management. */
export function toBranch(b: BranchDto | AdminBranchDto): BranchView {
  const admin = b as Partial<AdminBranchDto>;
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    lat: b.lat,
    lng: b.lng,
    staff: admin.staffCount ?? 0,
    customers: admin.customerCount ?? 0,
    main: b.main,
    chip: b.chip,
    hours: { open: b.openMinute, close: b.closeMinute },
  };
}

/** A customer in a list. `name` is one string in the database, shown the same in both languages. */
export function toCustomer(c: CustomerRowDto, now = Date.now()): Customer {
  const name = c.name ?? '';
  return {
    id: c.id,
    initial: initialOf(c.name),
    name: name ? { bn: name, en: name } : t('গ্রাহক', 'Customer'),
    phone: c.phone.startsWith('+880') && !c.phone.includes('X') ? formatPhone(c.phone) : c.phone,
    stamps: c.stamps,
    visits: c.visits,
    // Someone who has not been in yet has no last visit: showing the days since they joined would read as one.
    last: c.lastVisitAt ? relativeDays(ms(c.lastVisitAt), now) : t('এখনো আসেননি', 'No visit yet'),
    status: c.status,
    avatar: avatarColor(c.id),
  };
}

const stampWord = (n: number): Text => ({ bn: `${bnDigits(String(Math.abs(n)))}টি Stamp`, en: `${Math.abs(n)} stamp${Math.abs(n) === 1 ? '' : 's'}` });
const signed = (n: number): Text => ({ bn: `${n > 0 ? '+' : '−'}${bnDigits(String(Math.abs(n)))}টি Stamp`, en: `${n > 0 ? '+' : '−'}${Math.abs(n)} stamp${Math.abs(n) === 1 ? '' : 's'}` });

/** A line of the customer's own history (the History, Card and Card details screens). */
export function toHistoryItem(a: ActivityDto, now = Date.now()): HistoryItem {
  const at = ms(a.at);
  const group = groupLabel(at, now);
  const time = group.en === 'Today' ? clock(at) : day(at);
  const where = a.branch ? { bn: ` · ${a.branch.bn}`, en: ` · ${a.branch.en}` } : { bn: '', en: '' };
  const title = a.title ?? t('Reward', 'Reward');
  switch (a.kind) {
    case 'stamp':
      return { group, type: 'stamp', detail: t(`চা জয়${where.bn}`, `ChaJoy${where.en}`), time, count: a.count };
    case 'undo':
      return { group, type: 'stamp', detail: t('Stamp বাতিল', 'Stamp cancelled'), time, count: a.count };
    case 'welcome':
      return { group, type: 'stamp', detail: t('স্বাগতম বোনাস', 'Welcome bonus'), time, count: a.count };
    case 'offer-bonus':
      return { group, type: 'stamp', detail: t(`বোনাস Stamp · ${a.title?.bn ?? ''}`, `Bonus stamp · ${a.title?.en ?? ''}`), time, count: a.count };
    case 'adjust':
      return { group, type: 'stamp', detail: t('চা জয় সমন্বয়', 'Adjusted by ChaJoy'), time, count: a.count };
    case 'reward-unlocked':
      return { group, type: 'reward', detail: t(`Reward আনলক: ${title.bn}`, `Reward unlocked: ${title.en}`), time };
    case 'reward-redeemed':
      return { group, type: 'reward', detail: a.item ? t(`Reward নেওয়া হয়েছে: ${title.bn} · ${a.item.bn}`, `Redeemed: ${title.en} · ${a.item.en}`) : t(`Reward নেওয়া হয়েছে: ${title.bn}`, `Redeemed: ${title.en}`), time };
    case 'joined':
      return { group, type: 'join', detail: t('নতুন কার্ড', 'New card'), time };
  }
}

/** A line of a customer's timeline for management: what happened, who did it and where, and when. */
export function toTimelineEntry(a: ActivityDto, now = Date.now()) {
  const at = ms(a.at);
  const who = [a.staffName, a.branch?.en].filter(Boolean);
  const whoBn = [a.staffName, a.branch?.bn].filter(Boolean);
  const meta: Text = who.length ? { bn: whoBn.join(' · '), en: who.join(' · ') } : t('অ্যাপ', 'App');
  const count = a.count ?? 0;
  let what: Text;
  let color = '#F5D900';
  let mark = '+';
  switch (a.kind) {
    case 'stamp':
    case 'welcome':
    case 'offer-bonus':
      what = a.kind === 'welcome' ? t(`স্বাগতম বোনাস ${signed(count).bn}`, `Welcome bonus ${signed(count).en}`) : signed(count);
      break;
    case 'undo':
      what = t(`${stampWord(count).bn} বাতিল`, `${stampWord(count).en} cancelled`);
      mark = '−';
      break;
    case 'adjust':
      what = t(`${signed(count).bn} · ${a.reason ?? 'সমন্বয়'}`, `${signed(count).en} · ${a.reason ?? 'adjusted'}`);
      mark = count < 0 ? '−' : '+';
      break;
    case 'reward-unlocked':
      what = t(`Reward আনলক: ${a.title?.bn ?? ''}`, `Reward unlocked: ${a.title?.en ?? ''}`);
      color = '#FF8A9A';
      mark = '★';
      break;
    case 'reward-redeemed':
      what = t(`Reward দেওয়া হয়েছে: ${a.item?.bn ?? a.title?.bn ?? ''}`, `Reward given: ${a.item?.en ?? a.title?.en ?? ''}`);
      color = '#FF8A9A';
      mark = '✓';
      break;
    case 'joined':
      what = t('কার্ডে যোগ দিয়েছেন', 'Joined the card');
      color = '#8FE3D8';
      mark = '✓';
      break;
  }
  return { id: a.id, color, mark, what, meta, when: groupLabel(at, now).en === 'Today' ? clock(at) : day(at) };
}

const ACTIVITY_TYPE: Record<ActivityDto['kind'], ActivityType> = {
  stamp: 'stamp',
  undo: 'stamp',
  adjust: 'stamp',
  welcome: 'stamp',
  'offer-bonus': 'stamp',
  'reward-unlocked': 'reward',
  'reward-redeemed': 'reward',
  joined: 'join',
};

/** A row of the cashier's Today list and management's Recent activity table. */
export function toFeedLine(f: FeedItemDto, now = Date.now()) {
  const at = ms(f.at);
  const count = f.count ?? 0;
  let action: Text;
  switch (f.kind) {
    case 'stamp':
    case 'offer-bonus':
    case 'welcome':
      action = signed(count);
      break;
    case 'undo':
      action = t(`${stampWord(count).bn} বাতিল`, `${stampWord(count).en} cancelled`);
      break;
    case 'adjust':
      action = t(`${signed(count).bn} · সমন্বয়`, `${signed(count).en} · adjusted`);
      break;
    case 'reward-unlocked':
      action = t('কার্ড সম্পূর্ণ · Reward আনলক', 'Card complete · Reward unlocked');
      break;
    case 'reward-redeemed':
      action = t(`Reward · ${(f.item ?? f.title)?.bn ?? ''}`, `Reward · ${(f.item ?? f.title)?.en ?? ''}`);
      break;
    case 'joined':
      action = t('নতুন গ্রাহক', 'New customer');
      break;
  }
  const customerName = f.customer.name ?? '';
  return {
    id: f.id,
    customerId: f.customer.id,
    customerName: customerName ? t(customerName, customerName) : t('গ্রাহক', 'Customer'),
    type: ACTIVITY_TYPE[f.kind],
    action,
    staff: f.staff ? t(f.staff.name, f.staff.name) : t('অ্যাপ', 'App'),
    time: groupLabel(at, now).en === 'Today' ? clock(at) : day(at),
  };
}
