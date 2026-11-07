/**
 * Sample data for the prototype. Replace with API calls once the backend exists.
 * Every user-facing string is a { bn, en } pair.
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

/** The reward a full card unlocks, written as a title (the `reward` field above is for mid-sentence use). */
export const rewardTitle: Text = t('ফ্রি বাবল টি / আইসক্রিম', 'Free bubble tea or scoop');

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

/** Placeholder opening hours (minutes after midnight) shared by every outlet until real hours are set. */
export const OUTLET_HOURS = { open: 11 * 60, close: 23 * 60 };

export type ActivityType = 'stamp' | 'reward' | 'join';
export type HistoryItem = { group: Text; type: ActivityType; detail: Text; time: Text; count?: number };

export const history: HistoryItem[] = [
  { group: t('আজ', 'Today'), type: 'stamp', detail: t('বাবল টি', 'Bubble tea'), time: t('৪:১০ PM', '4:10 PM'), count: 1 },
  { group: t('অক্টোবর', 'October'), type: 'stamp', detail: t('মিল্কশেক ×২', 'Milkshake ×2'), time: t('২৮ অক্টোবর', 'Oct 28'), count: 2 },
  { group: t('অক্টোবর', 'October'), type: 'reward', detail: t('ফ্রি স্কুপ আইসক্রিম', 'Free ice cream scoop'), time: t('২০ অক্টোবর', 'Oct 20') },
  { group: t('অক্টোবর', 'October'), type: 'stamp', detail: t('সানডে', 'Sundae'), time: t('১৬ অক্টোবর', 'Oct 16'), count: 1 },
];

export const notifications: { color: string; mark: string; title: Text; body: Text; time: Text; unread: boolean }[] = [
  { color: '#F5D900', mark: '★', title: t('আর ৩টি Stamp বাকি!', 'Just 3 more stamps!'), body: t('আর ৩টি Stamp পেলেই ফ্রি বাবল টি বা আইসক্রিম।', '3 more stamps and your bubble tea or ice cream is free.'), time: t('১ ঘণ্টা আগে', '1h ago'), unread: true },
  { color: '#FF8A9A', mark: '2×', title: t('শুক্রবার ডাবল Stamp', 'Double stamps on Friday'), body: t('এই শুক্রবার চা জয়-এর প্রতি কেনাকাটায় ২টি Stamp পাবেন।', 'Get 2 stamps for every ChaJoy purchase this Friday.'), time: t('৫ ঘণ্টা আগে', '5h ago'), unread: true },
  { color: '#7FCBFF', mark: '!', title: t('Stamp-এর মেয়াদ শেষ হচ্ছে', 'Stamps expiring soon'), body: t('২টি Stamp ৭ দিনের মধ্যে মেয়াদ শেষ হবে।', '2 of your stamps expire in 7 days.'), time: t('গতকাল', 'Yesterday'), unread: true },
  { color: '#8FE3D8', mark: '✓', title: t('Reward নেওয়া হয়েছে', 'Reward redeemed'), body: t('ফ্রি স্কুপ আইসক্রিম নিয়েছেন। মজা করে খান!', 'You got a free ice cream scoop. Enjoy!'), time: t('২০ অক্টোবর', 'Oct 20'), unread: false },
  { color: '#7FD8CE', mark: '↻', title: t('chaJoy loyality-তে স্বাগতম', 'Welcome to chaJoy loyality'), body: t('যেকোনো আউটলেটে QR দেখিয়ে Stamp জমানো শুরু করুন।', 'Show your QR at any ChaJoy branch to start collecting stamps.'), time: t('২৮ অক্টোবর', 'Oct 28'), unread: false },
];

export type CustomerStatus = 'active' | 'ready' | 'inactive';
export type Customer = { id: string; initial: Text; name: Text; phone: string; stamps: number; visits: number; last: Text; status: CustomerStatus; avatar: string };

export const customers: Customer[] = [
  { id: 'tanvir', initial: t('তা', 'T'), name: t('তানভীর আহমেদ', 'Tanvir Ahmed'), phone: '+880 17XX-XXX123', stamps: 7, visits: 23, last: t('২ দিন আগে', '2 days ago'), status: 'active', avatar: '#F5D900' },
  { id: 'nusrat', initial: t('নু', 'N'), name: t('নুসরাত জাহান', 'Nusrat Jahan'), phone: '+880 18XX-XXX456', stamps: 10, visits: 19, last: t('আজ', 'Today'), status: 'ready', avatar: '#FF8A9A' },
  { id: 'sakib', initial: t('সা', 'S'), name: t('সাকিব হাসান', 'Sakib Hasan'), phone: '+880 19XX-XXX789', stamps: 1, visits: 1, last: t('আজ', 'Today'), status: 'active', avatar: '#8FE3D8' },
  { id: 'farhana', initial: t('ফা', 'F'), name: t('ফারহানা ইসলাম', 'Farhana Islam'), phone: '+880 16XX-XXX234', stamps: 4, visits: 17, last: t('৫ দিন আগে', '5 days ago'), status: 'active', avatar: '#7FD8CE' },
  { id: 'rashed', initial: t('রা', 'R'), name: t('রাশেদ করিম', 'Rashed Karim'), phone: '+880 15XX-XXX567', stamps: 10, visits: 12, last: t('গতকাল', 'Yesterday'), status: 'ready', avatar: '#7FCBFF' },
  { id: 'mehedi', initial: t('মে', 'M'), name: t('মেহেদী হাসান', 'Mehedi Hasan'), phone: '+880 17XX-XXX890', stamps: 3, visits: 6, last: t('৪১ দিন আগে', '41 days ago'), status: 'inactive', avatar: '#FF8FB1' },
  { id: 'tasnim', initial: t('তা', 'T'), name: t('তাসনিম রহমান', 'Tasnim Rahman'), phone: '+880 18XX-XXX321', stamps: 6, visits: 9, last: t('৩ দিন আগে', '3 days ago'), status: 'active', avatar: '#F5D900' },
  { id: 'arif', initial: t('আ', 'A'), name: t('আরিফ চৌধুরী', 'Arif Chowdhury'), phone: '+880 19XX-XXX654', stamps: 2, visits: 4, last: t('৫২ দিন আগে', '52 days ago'), status: 'inactive', avatar: '#8FE3D8' },
];

export const getCustomer = (id: string) => customers.find((c) => c.id === id);

export const customerCounts = { all: 312, active: 267, ready: 18, inactive: 45 };

export const timeline = [
  { color: '#F5D900', mark: '+', what: t('+১ Stamp · বাবল টি', '+1 stamp · Bubble tea'), meta: t('রাকিব · মিরপুর ১০', 'Rakib · Mirpur 10'), when: t('২ দিন আগে', '2 days ago') },
  { color: '#F5D900', mark: '+', what: t('+১ Stamp · সানডে', '+1 stamp · Sundae'), meta: t('মিতু · মিরপুর ১০', 'Mitu · Mirpur 10'), when: t('৬ দিন আগে', '6 days ago') },
  { color: '#7FCBFF', mark: '✉', what: t('অফার SMS পেয়েছেন', 'Received offer SMS'), meta: t('শুক্রবার ডাবল Stamp', 'Double stamp Friday'), when: t('৮ নভেম্বর', 'Nov 8') },
  { color: '#F5D900', mark: '+', what: t('+২ Stamp · মিল্কশেক', '+2 stamps · Milkshake'), meta: t('রাকিব · মিরপুর ১০', 'Rakib · Mirpur 10'), when: t('২৮ অক্টোবর', 'Oct 28') },
  { color: '#FF8A9A', mark: '★', what: t('Reward: ফ্রি আইসক্রিম স্কুপ', 'Reward: free ice cream scoop'), meta: t('রাকিব · মিরপুর ১০', 'Rakib · Mirpur 10'), when: t('২০ অক্টোবর', 'Oct 20') },
  { color: '#8FE3D8', mark: '✓', what: t('কার্ডে যোগ দিয়েছেন', 'Joined the card'), meta: t('কাউন্টার QR স্ক্যান', 'Counter QR scan'), when: t('১২ মে', 'May 12') },
];

export const weeklyVisits = [
  { day: t('শনি', 'Sat'), value: 38 }, { day: t('রবি', 'Sun'), value: 45 }, { day: t('সোম', 'Mon'), value: 41 },
  { day: t('মঙ্গল', 'Tue'), value: 52 }, { day: t('বুধ', 'Wed'), value: 48 }, { day: t('বৃহঃ', 'Thu'), value: 61 }, { day: t('শুক্র', 'Fri'), value: 70 },
];

export const popularItems = [
  { name: t('বাবল টি', 'Bubble tea'), stamps: 486, color: 'var(--brand)' },
  { name: t('স্কুপ আইসক্রিম', 'Scoop ice cream'), stamps: 352, color: '#F5D900' },
  { name: t('সানডে', 'Sundae'), stamps: 241, color: '#FF5D73' },
  { name: t('মিল্কশেক', 'Milkshake'), stamps: 169, color: '#2EC4B6' },
];

export const recentActivity = [
  { customerId: 'tanvir', type: 'stamp' as ActivityType, action: t('+১ Stamp · বাবল টি', '+1 stamp · Bubble tea'), staff: t('রাকিব', 'Rakib'), time: t('৪:১০ PM', '4:10 PM') },
  { customerId: 'nusrat', type: 'reward' as ActivityType, action: t('Reward · আইসক্রিম', 'Reward · Ice cream'), staff: t('রাকিব', 'Rakib'), time: t('৩:৪৫ PM', '3:45 PM') },
  { customerId: 'sakib', type: 'join' as ActivityType, action: t('নতুন গ্রাহক', 'New customer'), staff: t('মিতু', 'Mitu'), time: t('২:২০ PM', '2:20 PM') },
  { customerId: 'farhana', type: 'stamp' as ActivityType, action: t('+২ Stamp · মিল্কশেক', '+2 stamps · Milkshake'), staff: t('মিতু', 'Mitu'), time: t('১:০৫ PM', '1:05 PM') },
  { customerId: 'rashed', type: 'stamp' as ActivityType, action: t('+১ Stamp · সানডে', '+1 stamp · Sundae'), staff: t('রাকিব', 'Rakib'), time: t('১২:৩০ PM', '12:30 PM') },
];

export type Role = 'owner' | 'manager' | 'cashier';
export type Staff = { id: string; initial: Text; name: Text; role: Role; branch: Text; today: number | null; seen: Text; active: boolean; avatar: string };

export const staffMembers: Staff[] = [
  { id: 'rafiq', initial: t('র', 'R'), name: t('রফিক', 'Rafiq'), role: 'owner', branch: t('সব আউটলেট', 'All outlets'), today: null, seen: t('এখন অনলাইন', 'Online now'), active: true, avatar: '#7FD8CE' },
  { id: 'rakib', initial: t('রা', 'R'), name: t('রাকিব', 'Rakib'), role: 'cashier', branch: t('মিরপুর ১০', 'Mirpur 10'), today: 24, seen: t('এখন অনলাইন', 'Online now'), active: true, avatar: '#F5D900' },
  { id: 'mitu', initial: t('মি', 'M'), name: t('মিতু', 'Mitu'), role: 'cashier', branch: t('মিরপুর ১০', 'Mirpur 10'), today: 11, seen: t('২০ মিনিট আগে', '20 min ago'), active: true, avatar: '#FF8A9A' },
  { id: 'sohel', initial: t('সো', 'S'), name: t('সোহেল', 'Sohel'), role: 'manager', branch: t('মোহাম্মদপুর', 'Mohammadpur'), today: 8, seen: t('১ ঘণ্টা আগে', '1 hour ago'), active: true, avatar: '#8FE3D8' },
  { id: 'jui', initial: t('জু', 'J'), name: t('জুই', 'Jui'), role: 'cashier', branch: t('রামপুরা', 'Rampura'), today: 0, seen: t('৩ দিন আগে', '3 days ago'), active: false, avatar: '#7FCBFF' },
];

/** The sample numbers the cashier's day starts from. Live activity in the store is added on top. */
export const todayBaseline = { stamps: 24, rewards: 3, newCustomers: 5, cancelled: 0 };

/** The cashier signed in on the counter device, and the outlet that counter belongs to. */
export const onDutyCashier = staffMembers.find((m) => m.id === 'rakib') ?? staffMembers[0];
export const counterOutlet = branches.find((b) => b.main) ?? branches[0];

export const campaigns = [
  { name: t('শুক্রবার ডাবল Stamp', 'Double stamp Friday'), meta: t('৮ নভেম্বর · ৩১২ জন', 'Nov 8 · 312 people'), result: t('৪১ জন এসেছেন', '41 came back') },
  { name: t('আমরা আপনাকে মিস করছি', 'We miss you'), meta: t('২৫ অক্টোবর · ৫২ জন', 'Oct 25 · 52 people'), result: t('৯ জন এসেছেন', '9 came back') },
  { name: t('নতুন ম্যাচা ফ্লেভার', 'New matcha flavour'), meta: t('১০ অক্টোবর · ২৮৮ জন', 'Oct 10 · 288 people'), result: t('৩৩ জন এসেছেন', '33 came back') },
];

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
};

/** Reward vouchers issued when a card fills or an offer is claimed. */
export const vouchers: Voucher[] = [
  { id: 'v-card', code: 'CJ-4F7K-92', title: rewardTitle, source: t('কার্ড সম্পূর্ণ', 'Card completed'), earned: t('২ নভেম্বর', '2 Nov'), expires: t('২ ডিসেম্বর', '2 Dec'), daysLeft: 24, status: 'ready', choices: shop.rewardItems },
  { id: 'v-topping', code: 'CJ-9M3Q-17', title: t('ফ্রি টপিং', 'Free topping'), source: t('অফার: ফ্রি টপিং', 'Offer: Free topping'), earned: t('৩ নভেম্বর', '3 Nov'), expires: t('১০ নভেম্বর', '10 Nov'), daysLeft: 2, status: 'ready' },
  { id: 'v-scoop', code: 'CJ-2B8D-55', title: t('ফ্রি স্কুপ আইসক্রিম', 'Free ice cream scoop'), source: t('কার্ড সম্পূর্ণ', 'Card completed'), earned: t('২০ অক্টোবর', '20 Oct'), expires: t('১৯ নভেম্বর', '19 Nov'), daysLeft: 0, status: 'used', usedOn: t('২০ অক্টোবর', '20 Oct') },
  { id: 'v-sundae', code: 'CJ-6T1H-08', title: t('ফ্রি সানডে', 'Free sundae'), source: t('কার্ড সম্পূর্ণ', 'Card completed'), earned: t('১ সেপ্টেম্বর', '1 Sep'), expires: t('১ অক্টোবর', '1 Oct'), daysLeft: 0, status: 'expired' },
];

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
