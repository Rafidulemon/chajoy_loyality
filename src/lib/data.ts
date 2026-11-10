/**
 * What the three apps share about ChaJoy: the UI types the API adapters produce, ChaJoy's starting card, and the outlet and
 * offer reference data the seed script loads into an empty database (prisma/seed.ts). Nothing here is customer data: every
 * customer, card, voucher and activity comes from the API. Every user-facing string is a { bn, en } pair.
 */
import type { Text } from './i18n';

const t = (bn: string, en: string): Text => ({ bn, en });

export type Shop = {
  id: string;
  name: Text;
  /** What the card is called, shown on it under the brand name. */
  cardName: Text;
  initial: Text;
  area: Text;
  reward: Text;
  rewardItems: Text[];
  total: number;
  collected: number;
  color: string;
  fg: string;
  /** True for a dark card, which needs light marks instead of dark ones. */
  dark: boolean;
  stampBg: string;
  stampFg: string;
  dash: string;
  deco1: string;
  deco2: string;
};

/** ChaJoy is the only vendor. This is the starting card; the live one is this with the loyalty program applied (see lib/program.ts). */
export const shop: Shop = {
  id: 'chajoy', name: t('চা জয়', 'ChaJoy'), cardName: t('লয়্যালটি কার্ড', 'Loyalty card'), initial: t('চা', 'C'),
  area: t('ডেজার্ট ও চা', 'Ice cream and tea'),
  reward: t('ফ্রি বাবল টি / আইসক্রিম', 'free bubble tea or scoop'),
  rewardItems: [t('বাবল টি', 'Bubble tea'), t('স্কুপ আইসক্রিম', 'Ice cream scoop'), t('মিল্কশেক', 'Milkshake')],
  total: 10, collected: 7,
  color: '#97C334', fg: '#171717', dark: false, stampBg: '#171717', stampFg: '#F5D900', dash: 'rgba(23,23,23,0.5)', deco1: 'rgba(245,217,0,0.9)', deco2: 'rgba(255,93,115,0.85)',
};

export type Branch = {
  id: string;
  name: Text;
  address: Text;
  /** Approximate coordinates, only used to sort outlets by distance. Replace with exact values. */
  lat: number;
  lng: number;
  staff: number;
  customers: number;
  main: boolean;
  chip: string;
};

/** ChaJoy's ten outlets. Staff and customer counts are sample numbers. */
export const branches: Branch[] = [
  { id: 'kochukhet', name: t('কচুক্ষেত', 'Kochukhet'), address: t('কচুক্ষেত রোড, ঢাকা', 'Kachukhet Road, Dhaka'), lat: 23.8185, lng: 90.385, staff: 0, customers: 15, main: false, chip: '#97C334' },
  { id: 'uttara-bns', name: t('উত্তরা (বিএনএস)', 'Uttara (BNS)'), address: t('প্লট ৮৯, রোড ২৮, সেক্টর ৭', 'Plot 89, Road 28, Sector 7'), lat: 23.865, lng: 90.401, staff: 0, customers: 38, main: false, chip: '#F5D900' },
  { id: 'badda', name: t('বাড্ডা', 'Badda'), address: t('এক্সআইসি পয়েন্ট, বীর উত্তম রফিকুল ইসলাম এভিনিউ', 'XIC Point, Bir Uttam Rafiqul Islam Avenue'), lat: 23.777, lng: 90.426, staff: 0, customers: 31, main: false, chip: '#FF8A9A' },
  { id: 'mirpur-10', name: t('মিরপুর ১০', 'Mirpur 10'), address: t('১৯, মিরপুর ১০ গোলচত্বর', '19, Mirpur 10 Roundabout'), lat: 23.8069, lng: 90.3687, staff: 3, customers: 96, main: true, chip: '#8FE3D8' },
  { id: 'mohammadpur', name: t('মোহাম্মদপুর', 'Mohammadpur'), address: t('৩০, ২৩ তাজমহল রোড', '30, 23 Tajmahal Road'), lat: 23.764, lng: 90.359, staff: 1, customers: 29, main: false, chip: '#97C334' },
  { id: 'mirpur-2', name: t('মিরপুর ২', 'Mirpur 2'), address: t('বাড়ি ৩০৭/৩০৮, ব্লক চ', 'House 307/308, Block CHA'), lat: 23.8057, lng: 90.3612, staff: 0, customers: 27, main: false, chip: '#F5D900' },
  { id: 'rampura', name: t('রামপুরা', 'Rampura'), address: t('সার্কেল আম্বিয়া পয়েন্ট', 'Circle Ambia Point'), lat: 23.7616, lng: 90.4217, staff: 1, customers: 24, main: false, chip: '#FF8A9A' },
  { id: 'bashundhara', name: t('বসুন্ধরা (যমুনা)', 'Bashundhara (Jamuna)'), address: t('১৮৬ বসুন্ধরা রোড', '186 Bashundhara Road'), lat: 23.8133, lng: 90.424, staff: 0, customers: 22, main: false, chip: '#8FE3D8' },
  { id: 'banasree', name: t('বনশ্রী', 'Banasree'), address: t('ব্লক এফ, বাড়ি ০১, রোড ০৪', 'Block F, House 01, Road 04'), lat: 23.7634, lng: 90.4313, staff: 0, customers: 18, main: false, chip: '#97C334' },
  { id: 'laxmibazar', name: t('লক্ষ্মীবাজার', 'Laxmibazar'), address: t('পুরান ঢাকা, লক্ষ্মীবাজার', 'Old Dhaka, Laxmibazar'), lat: 23.7108, lng: 90.4098, staff: 0, customers: 12, main: false, chip: '#F5D900' },
];

export type ActivityType = 'stamp' | 'reward' | 'join';
export type HistoryItem = { group: Text; type: ActivityType; detail: Text; time: Text; count?: number };

export type CustomerStatus = 'active' | 'ready' | 'inactive';
export type Customer = { id: string; initial: Text; name: Text; phone: string; stamps: number; visits: number; last: Text; status: CustomerStatus; avatar: string };

export type VoucherStatus = 'ready' | 'used' | 'expired';
export type Voucher = {
  id: string;
  /** Shown as text and encoded in the voucher QR. */
  code: string;
  title: Text;
  source: Text;
  earned: Text;
  expires: Text;
  daysLeft: number;
  status: VoucherStatus;
  usedOn?: Text;
  /** Items the customer picks from at the counter. */
  choices?: Text[];
  /** The ids of those items, in the same order: this is what is sent to the server when the cashier picks one. */
  choiceIds?: string[];
};

export type OfferKind = 'double' | 'stamp' | 'voucher' | 'info' | 'birthday';
export type Offer = {
  id: string;
  kind: OfferKind;
  /** Big mark on the offer banner. */
  badge: Text;
  title: Text;
  body: Text;
  /** Days left, or null when the offer has no end date. */
  endsInDays: number | null;
  /** 'stamp' offers: stamps added when claimed. */
  bonusStamps?: number;
  /** 'voucher' offers: the voucher created when claimed. */
  reward?: Text;
  voucherDays?: number;
  /** 'birthday' offers: when it unlocks. */
  unlocksOn?: Text;
  terms: Text[];
  bg: string;
  fg: string;
};

export const offers: Offer[] = [
  {
    id: 'welcome-back', kind: 'stamp', badge: t('+১', '+1'), title: t('ফিরে আসার Stamp', 'Welcome-back stamp'),
    body: t('এই সপ্তাহে আসার জন্য ধন্যবাদ! ১টি বোনাস Stamp নিন।', 'Thanks for visiting this week! Claim a free bonus stamp.'), endsInDays: 3, bonusStamps: 1,
    terms: [t('প্রতি গ্রাহক একবারই নিতে পারবেন', 'One claim per customer'), t('Stamp সরাসরি আপনার কার্ডে যোগ হবে', 'The stamp is added straight to your card')],
    bg: '#97C334', fg: '#171717',
  },
  {
    id: 'free-topping', kind: 'voucher', badge: t('ফ্রি', 'FREE'), title: t('ফ্রি টপিং', 'Free topping'),
    body: t('যেকোনো বাবল টি বা মিল্কশেকের সাথে একটি ফ্রি টপিং।', 'A free topping with any bubble tea or milkshake.'), endsInDays: 6, reward: t('ফ্রি টপিং', 'Free topping'), voucherDays: 7,
    terms: [t('নেওয়ার ৭ দিনের মধ্যে ব্যবহার করতে হবে', 'Use within 7 days of claiming'), t('প্রতি ভিজিটে ১টি', 'One per visit')],
    bg: '#171717', fg: '#F5D900',
  },
  {
    id: 'double-friday', kind: 'double', badge: t('২×', '2×'), title: t('শুক্রবার ডাবল Stamp', 'Double stamp Friday'),
    body: t('শুক্রবার প্রতিটি কেনাকাটায় ২টি করে Stamp পাবেন, সব আউটলেটে।', 'Get 2 stamps on every purchase this Friday at every outlet.'), endsInDays: 5,
    terms: [t('প্রতি কেনাকাটায় সর্বোচ্চ ২টি Stamp', 'Up to 2 stamps per purchase'), t('অন্য অফারের সাথে মেশানো যাবে না', 'Cannot be combined with other offers')],
    bg: '#F5D900', fg: '#171717',
  },
  {
    id: 'tea-scoop-combo', kind: 'info', badge: t('কম্বো', 'COMBO'), title: t('গরম চা + স্কুপ কম্বো', 'Hot tea + scoop combo'),
    body: t('এক কাপ গরম চা আর এক স্কুপ আইসক্রিম। কাউন্টারে এই অফারটি দেখান।', 'A hot cup of tea with a scoop of ice cream. Show this offer at the counter.'), endsInDays: 12,
    terms: [t('সীমিত সময়ের জন্য', 'Limited time only'), t('Stamp যথারীতি পাবেন', 'Stamps are earned as usual')],
    bg: '#668C1F', fg: '#FFFFFF',
  },
  {
    id: 'birthday', kind: 'birthday', badge: t('জন্মদিন', 'BDAY'), title: t('জন্মদিনের উপহার', 'Birthday treat'),
    body: t('জন্মদিনের সপ্তাহে একটি ফ্রি স্কুপ আইসক্রিম।', 'A free ice cream scoop in your birthday week.'), endsInDays: null, unlocksOn: t('১২ মার্চ', '12 March'),
    terms: [t('জন্মদিনের সপ্তাহে ব্যবহার করতে হবে', 'Use it during your birthday week')],
    bg: '#FF8A9A', fg: '#171717',
  },
];

/** Offers a customer has to claim first. The rest apply automatically or are shown at the counter. */
export const isClaimable = (o: Offer) => o.kind === 'stamp' || o.kind === 'voucher';
