'use client';

/**
 * The shared in-memory "backend" for the prototype. It holds every customer's card (stamps, reward vouchers,
 * claimed offers, activity), the loyalty program management sets up, the offers management publishes, outlet
 * opening hours, the activity feed and the day's live counters, so the customer, cashier and management apps
 * all see the same data.
 * A BroadcastChannel mirrors every change to the other open tabs, which is how a stamp added in a cashier tab
 * lands on a card in a customer tab. Nothing is saved: a reload goes back to the sample data in data.ts.
 * Replace this with API calls and a push or websocket subscription when the backend exists.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import {
  OUTLET_HOURS,
  todayBaseline,
  branches,
  customers as seedCustomers,
  offers as seedOffers,
  recentActivity,
  shop,
  vouchers as seedVouchers,
  type ActivityType,
  type Customer,
  type HistoryItem,
  type Offer,
  type Voucher,
} from './data';
import type { Text } from './i18n';
import { buildShop, defaultProgram, itemsOf, rewardText, rewardTitleFor, type Program } from './program';

/** The customer whose card the customer app shows. */
export const DEMO_CUSTOMER = 'tanvir';

const DEFAULT_TOTAL = defaultProgram.total;
const DAY = 86_400_000;
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const MONTHS: Text[] = [
  { bn: 'জানুয়ারি', en: 'Jan' }, { bn: 'ফেব্রুয়ারি', en: 'Feb' }, { bn: 'মার্চ', en: 'Mar' }, { bn: 'এপ্রিল', en: 'Apr' },
  { bn: 'মে', en: 'May' }, { bn: 'জুন', en: 'Jun' }, { bn: 'জুলাই', en: 'Jul' }, { bn: 'আগস্ট', en: 'Aug' },
  { bn: 'সেপ্টেম্বর', en: 'Sep' }, { bn: 'অক্টোবর', en: 'Oct' }, { bn: 'নভেম্বর', en: 'Nov' }, { bn: 'ডিসেম্বর', en: 'Dec' },
];
const TODAY: Text = { bn: 'আজ', en: 'Today' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AVATARS = ['#97C334', '#F5D900', '#FF8A9A', '#8FE3D8', '#7FCBFF'];

/** Western digits to Bangla digits in a string. */
export const bnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
const rand = (len: number) => Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** 1731000000000 -> "7 Nov" */
export function day(ms: number): Text {
  const d = new Date(ms);
  const m = MONTHS[d.getMonth()];
  return { bn: `${bnDigits(String(d.getDate()))} ${m.bn}`, en: `${d.getDate()} ${m.en}` };
}

/** 1731000000000 -> "4:10 PM" */
export function clock(ms: number): Text {
  const d = new Date(ms);
  const h = d.getHours();
  const en = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { bn: bnDigits(en), en };
}

/** Build a fresh reward voucher that is valid for `days` days from `at`. */
export function newVoucher(at: number, title: Text, source: Text, days: number, choices?: Text[]): Voucher {
  return {
    id: `v-${at.toString(36)}-${rand(3)}`,
    code: `CJ-${rand(4)}-${Math.floor(10 + Math.random() * 90)}`,
    title,
    source,
    earned: day(at),
    expires: day(at + days * DAY),
    daysLeft: days,
    status: 'ready',
    choices,
  };
}

/** The voucher a customer gets when a card fills, using the reward items the program offers right now. */
function completionVoucher(program: Program, at: number): Voucher {
  const items = itemsOf(program);
  return newVoucher(at, rewardTitleFor(items), { bn: 'কার্ড সম্পূর্ণ', en: 'Card completed' }, 30, items.map((i) => i.name));
}

/**
 * The same voucher, but with an id and code worked out from the customer instead of at random, for the reducer
 * (it has to give the same answer in every tab) when changing the program completes cards.
 */
function programVoucher(program: Program, at: number, customerId: string, k: number): Voucher {
  const items = itemsOf(program);
  const key = customerId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  return {
    id: `v-${at.toString(36)}-${customerId}-${k}`,
    code: `CJ-${key}-${10 + ((at + k) % 90)}`,
    title: rewardTitleFor(items),
    source: { bn: 'কার্ড সম্পূর্ণ', en: 'Card completed' },
    earned: day(at),
    expires: day(at + 30 * DAY),
    daysLeft: 30,
    status: 'ready',
    choices: items.map((i) => i.name),
  };
}

/** One customer's loyalty card and what is attached to it. */
export type CardState = {
  stamps: number;
  visits: number;
  /** Stamps earned over the customer's lifetime. */
  lifetime: number;
  /** Rewards earned over the customer's lifetime. */
  earned: number;
  /** Stamps a cashier gave this customer today, which the program's daily limit is checked against. */
  givenToday: number;
  vouchers: Voucher[];
  claimed: string[];
  /** Activity from this session, newest first. Older history comes from data.ts. */
  activity: HistoryItem[];
};

/** A line in the activity feed shown to management and the cashier. */
export type FeedItem = { customerId: string; type: ActivityType; action: Text; staff: Text; time: Text };
/** An offer as management manages it: the offer plus whether it is shown to customers and how often it was claimed. */
export type OfferRow = Offer & { status: 'live' | 'paused'; claims: number };
/** Opening and closing time of an outlet, in minutes after midnight. */
export type Hours = { open: number; close: number };
/** What happened in this session on top of the sample day. */
export type Live = { stamps: number; bonus: number; rewards: number; newCustomers: number; cancelled: number };
/** Marks the latest stamp for the demo customer so their card can animate it and the shell can show a toast. */
export type Pulse = { id: number; at: number; count: number; after: number; filled: boolean };
/** Who or what added the stamps: a cashier at the counter, an offer the customer claimed, or management. */
export type Source = 'cashier' | 'offer' | 'owner';

type Snapshot = {
  cards: Record<string, CardState>;
  added: Customer[];
  program: Program;
  offers: OfferRow[];
  hours: Record<string, Hours>;
  feed: FeedItem[];
  live: Live;
};
type State = Snapshot & { pulse: Pulse | null; unlocked: string | null };

type Action =
  | { type: 'stamps'; at: number; customerId: string; count: number; detail: Text; by: Text; source: Source; voucher: Voucher }
  | { type: 'undo'; at: number; customerId: string; count: number; by: Text }
  | { type: 'redeem'; at: number; customerId: string; id: string; by: Text; item?: Text }
  | { type: 'claim'; customerId: string; offerId: string; voucher: Voucher | null }
  | { type: 'customer'; at: number; customer: Customer; by: Text }
  | { type: 'program'; at: number; program: Program; by: Text }
  | { type: 'offer'; offer: OfferRow }
  | { type: 'offer-remove'; id: string }
  | { type: 'offer-status'; id: string; status: OfferRow['status'] }
  | { type: 'hours'; outletId: string; hours: Hours }
  | { type: 'dismiss' }
  | { type: 'snapshot'; snapshot: Snapshot };

/** A sample customer's card. A full sample card is turned into a ready voucher, the way a real completed card would be. */
function seedCard(c: Customer): CardState {
  const lifetime = Math.round(c.visits * 1.3) + c.stamps;
  const full = c.stamps >= DEFAULT_TOTAL;
  const items = itemsOf(defaultProgram);
  return {
    stamps: full ? 0 : c.stamps,
    visits: c.visits,
    lifetime,
    earned: Math.floor(lifetime / DEFAULT_TOTAL),
    givenToday: 0,
    vouchers: full
      ? [{ id: `v-${c.id}`, code: `CJ-${c.id.slice(0, 4).toUpperCase()}-${String(c.visits).padStart(2, '0')}`, title: rewardTitleFor(items), source: { bn: 'কার্ড সম্পূর্ণ', en: 'Card completed' }, earned: { bn: '৭ নভেম্বর', en: '7 Nov' }, expires: { bn: '৭ ডিসেম্বর', en: '7 Dec' }, daysLeft: 29, status: 'ready', choices: items.map((i) => i.name) }]
      : [],
    claimed: [],
    activity: [],
  };
}

const SEED_CLAIMS: Record<string, number> = { 'welcome-back': 18, 'free-topping': 42 };

const initial: State = {
  cards: Object.fromEntries(
    seedCustomers.map((c) => [
      c.id,
      c.id === DEMO_CUSTOMER
        ? { stamps: shop.collected, visits: c.visits, lifetime: 46, earned: 4, givenToday: 0, vouchers: seedVouchers, claimed: [], activity: [] }
        : seedCard(c),
    ]),
  ),
  added: [],
  program: defaultProgram,
  offers: seedOffers.map((o) => ({ ...o, status: 'live' as const, claims: SEED_CLAIMS[o.id] ?? 0 })),
  hours: Object.fromEntries(branches.map((b) => [b.id, { ...OUTLET_HOURS }])),
  feed: recentActivity,
  live: { stamps: 0, bonus: 0, rewards: 0, newCustomers: 0, cancelled: 0 },
  pulse: null,
  unlocked: null,
};

const pick = (s: State): Snapshot => ({ cards: s.cards, added: s.added, program: s.program, offers: s.offers, hours: s.hours, feed: s.feed, live: s.live });

const stampText = (count: number): Text => ({
  bn: `${count > 0 ? '+' : ''}${bnDigits(String(count))}টি Stamp`,
  en: `${count > 0 ? '+' : ''}${count} stamp${Math.abs(count) > 1 ? 's' : ''}`,
});

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'stamps': {
      const card = s.cards[a.customerId];
      if (!card) return s;
      const total = s.program.total;
      const sum = Math.max(0, card.stamps + a.count);
      const filled = a.count > 0 && sum >= total;
      const reward = rewardText(itemsOf(s.program));
      const stamp: HistoryItem = { group: TODAY, type: 'stamp', detail: a.detail, time: clock(a.at), count: a.count };
      const unlock: HistoryItem = {
        group: TODAY,
        type: 'reward',
        detail: { bn: `Reward আনলক: ${reward.bn}`, en: `Reward unlocked: ${reward.en}` },
        time: clock(a.at),
      };
      const next: CardState = {
        ...card,
        stamps: filled ? Math.min(sum - total, total - 1) : sum,
        visits: card.visits + (a.source === 'cashier' ? 1 : 0),
        lifetime: Math.max(0, card.lifetime + a.count),
        earned: filled ? card.earned + 1 : card.earned,
        givenToday: card.givenToday + (a.source === 'cashier' ? Math.max(a.count, 0) : 0),
        vouchers: filled ? [a.voucher, ...card.vouchers] : card.vouchers,
        activity: filled ? [unlock, stamp, ...card.activity] : [stamp, ...card.activity],
      };
      const entry: FeedItem = {
        customerId: a.customerId,
        type: filled ? 'reward' : 'stamp',
        action: filled
          ? { bn: 'কার্ড সম্পূর্ণ · Reward আনলক', en: 'Card complete · Reward unlocked' }
          : a.count > 0
            ? stampText(a.count)
            : { bn: `${stampText(a.count).bn} · সমন্বয়`, en: `${stampText(a.count).en} · adjusted` },
        staff: a.by,
        time: clock(a.at),
      };
      const demo = a.customerId === DEMO_CUSTOMER;
      return {
        ...s,
        cards: { ...s.cards, [a.customerId]: next },
        feed: [entry, ...s.feed],
        live:
          a.source === 'cashier'
            ? { ...s.live, stamps: s.live.stamps + Math.max(a.count, 0) }
            : { ...s.live, bonus: s.live.bonus + a.count },
        unlocked: demo && filled ? a.voucher.id : s.unlocked,
        pulse: demo && a.count > 0 ? { id: (s.pulse?.id ?? 0) + 1, at: a.at, count: a.count, after: Math.min(sum, total), filled } : s.pulse,
      };
    }
    case 'undo': {
      const card = s.cards[a.customerId];
      if (!card) return s;
      const cancelled: HistoryItem = { group: TODAY, type: 'stamp', detail: { bn: 'Stamp বাতিল', en: 'Stamp cancelled' }, time: clock(a.at), count: -a.count };
      return {
        ...s,
        cards: {
          ...s.cards,
          [a.customerId]: {
            ...card,
            stamps: Math.max(0, card.stamps - a.count),
            visits: Math.max(0, card.visits - 1),
            lifetime: Math.max(0, card.lifetime - a.count),
            givenToday: Math.max(0, card.givenToday - a.count),
            activity: [cancelled, ...card.activity],
          },
        },
        feed: [
          { customerId: a.customerId, type: 'stamp', action: { bn: `${bnDigits(String(a.count))}টি Stamp বাতিল`, en: `${a.count} stamp${a.count > 1 ? 's' : ''} cancelled` }, staff: a.by, time: clock(a.at) },
          ...s.feed,
        ],
        live: { ...s.live, cancelled: s.live.cancelled + a.count },
      };
    }
    case 'redeem': {
      const card = s.cards[a.customerId];
      const v = card?.vouchers.find((x) => x.id === a.id && x.status === 'ready');
      if (!card || !v) return s;
      const given: Text = a.item ? { bn: `${v.title.bn} · ${a.item.bn}`, en: `${v.title.en} · ${a.item.en}` } : v.title;
      const done: HistoryItem = { group: TODAY, type: 'reward', detail: { bn: `Reward নেওয়া হয়েছে: ${given.bn}`, en: `Redeemed: ${given.en}` }, time: clock(a.at) };
      return {
        ...s,
        cards: {
          ...s.cards,
          [a.customerId]: {
            ...card,
            vouchers: card.vouchers.map((x) => (x.id === a.id ? { ...x, status: 'used' as const, usedOn: day(a.at) } : x)),
            activity: [done, ...card.activity],
          },
        },
        // The feed names what was handed over (the chosen item), not the whole voucher title, so the label stays short.
        feed: [{ customerId: a.customerId, type: 'reward', action: { bn: `Reward · ${(a.item ?? v.title).bn}`, en: `Reward · ${(a.item ?? v.title).en}` }, staff: a.by, time: clock(a.at) }, ...s.feed],
        live: { ...s.live, rewards: s.live.rewards + 1 },
      };
    }
    case 'claim': {
      const card = s.cards[a.customerId];
      if (!card || card.claimed.includes(a.offerId)) return s;
      return {
        ...s,
        cards: { ...s.cards, [a.customerId]: { ...card, claimed: [...card.claimed, a.offerId], vouchers: a.voucher ? [a.voucher, ...card.vouchers] : card.vouchers } },
        offers: s.offers.map((o) => (o.id === a.offerId ? { ...o, claims: o.claims + 1 } : o)),
      };
    }
    case 'customer': {
      if (s.cards[a.customer.id]) return s;
      const welcome = s.program.welcome ? 1 : 0;
      const welcomeItem: HistoryItem = { group: TODAY, type: 'stamp', detail: { bn: 'স্বাগতম বোনাস', en: 'Welcome bonus' }, time: clock(a.at), count: 1 };
      const joined: HistoryItem = { group: TODAY, type: 'join', detail: { bn: 'নতুন কার্ড', en: 'New card' }, time: clock(a.at) };
      return {
        ...s,
        added: [a.customer, ...s.added],
        cards: {
          ...s.cards,
          [a.customer.id]: { stamps: welcome, visits: 1, lifetime: welcome, earned: 0, givenToday: 0, vouchers: [], claimed: [], activity: welcome ? [welcomeItem, joined] : [joined] },
        },
        feed: [{ customerId: a.customer.id, type: 'join', action: { bn: 'নতুন গ্রাহক', en: 'New customer' }, staff: a.by, time: clock(a.at) }, ...s.feed],
        live: { ...s.live, newCustomers: s.live.newCustomers + 1, bonus: s.live.bonus + welcome },
      };
    }
    case 'program': {
      // A smaller card means some customers already have enough stamps: they complete it and get a reward voucher each time.
      const total = a.program.total;
      const reward = rewardText(itemsOf(a.program));
      let unlocked = s.unlocked;
      let pulse = s.pulse;
      const completed: FeedItem[] = [];
      const cards = Object.fromEntries(
        Object.entries(s.cards).map(([id, card]) => {
          if (card.stamps < total) return [id, card];
          const times = Math.floor(card.stamps / total);
          const fresh = Array.from({ length: times }, (_, k) => programVoucher(a.program, a.at, id, k));
          const unlock: HistoryItem = { group: TODAY, type: 'reward', detail: { bn: `Reward আনলক: ${reward.bn}`, en: `Reward unlocked: ${reward.en}` }, time: clock(a.at) };
          completed.push({ customerId: id, type: 'reward', action: { bn: 'কার্ড সম্পূর্ণ · Reward আনলক', en: 'Card complete · Reward unlocked' }, staff: a.by, time: clock(a.at) });
          if (id === DEMO_CUSTOMER) {
            unlocked = fresh[0].id;
            pulse = { id: (s.pulse?.id ?? 0) + 1, at: a.at, count: 0, after: total, filled: true };
          }
          return [id, { ...card, stamps: card.stamps - times * total, earned: card.earned + times, vouchers: [...fresh, ...card.vouchers], activity: [unlock, ...card.activity] }];
        }),
      );
      return { ...s, program: a.program, cards, feed: [...completed, ...s.feed], unlocked, pulse };
    }
    case 'offer':
      return { ...s, offers: s.offers.some((o) => o.id === a.offer.id) ? s.offers.map((o) => (o.id === a.offer.id ? a.offer : o)) : [a.offer, ...s.offers] };
    case 'offer-remove':
      return { ...s, offers: s.offers.filter((o) => o.id !== a.id) };
    case 'offer-status':
      return { ...s, offers: s.offers.map((o) => (o.id === a.id ? { ...o, status: a.status } : o)) };
    case 'hours':
      return { ...s, hours: { ...s.hours, [a.outletId]: a.hours } };
    case 'dismiss':
      return { ...s, unlocked: null };
    case 'snapshot':
      return { ...s, ...a.snapshot };
  }
}

export type Store = State & {
  /** Every customer: the ones added at the counter first, then the sample ones. */
  customers: Customer[];
  customer: (id: string) => Customer | undefined;
  /** Look a voucher up by the code printed under its QR, across every customer. */
  findVoucher: (code: string) => { customerId: string; voucher: Voucher } | null;
  /** Add (or, with a negative count, take away) stamps. Returns whether this completed the card. */
  addStamps: (customerId: string, count: number, o: { detail: Text; by: Text; source: Source }) => { completed: boolean };
  undoStamps: (customerId: string, count: number, by: Text) => void;
  redeem: (customerId: string, voucherId: string, by: Text, item?: Text) => void;
  claimOffer: (customerId: string, offer: Offer) => void;
  /** Create a customer at the counter or from the dashboard. They start with the welcome stamp if the program gives one. */
  addCustomer: (name: string, phone: string, by: Text) => Customer;
  /** Save the loyalty program. Customers who already have enough stamps for a smaller card complete it. */
  saveProgram: (program: Program, by: Text) => void;
  saveOffer: (offer: OfferRow) => void;
  removeOffer: (id: string) => void;
  setOfferStatus: (id: string, status: OfferRow['status']) => void;
  setHours: (outletId: string, hours: Hours) => void;
  dismissUnlock: () => void;
};

const StoreContext = createContext<Store | null>(null);

type Message = { k: 'action'; a: Action } | { k: 'hello' } | { k: 'snapshot'; s: Snapshot };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initial);
  const stateRef = useRef(state);
  const channel = useRef<BroadcastChannel | null>(null);
  /** True once this tab has applied any change, so a late snapshot from another tab cannot overwrite it. */
  const touched = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('chajoy-store');
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Message>) => {
      const m = e.data;
      if (m.k === 'action') {
        touched.current = true;
        dispatch(m.a);
      } else if (m.k === 'hello') {
        ch.postMessage({ k: 'snapshot', s: pick(stateRef.current) } satisfies Message);
      } else if (m.k === 'snapshot' && !touched.current) {
        touched.current = true;
        dispatch({ type: 'snapshot', snapshot: m.s });
      }
    };
    ch.postMessage({ k: 'hello' } satisfies Message);
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  const send = useCallback((a: Action) => {
    touched.current = true;
    dispatch(a);
    if (a.type !== 'dismiss') channel.current?.postMessage({ k: 'action', a } satisfies Message);
  }, []);

  const addStamps = useCallback<Store['addStamps']>(
    (customerId, count, o) => {
      const at = Date.now();
      const program = stateRef.current.program;
      const card = stateRef.current.cards[customerId];
      const completed = !!card && count > 0 && card.stamps + count >= program.total;
      send({ type: 'stamps', at, customerId, count, detail: o.detail, by: o.by, source: o.source, voucher: completionVoucher(program, at) });
      return { completed };
    },
    [send],
  );

  const undoStamps = useCallback<Store['undoStamps']>((customerId, count, by) => send({ type: 'undo', at: Date.now(), customerId, count, by }), [send]);

  const redeem = useCallback<Store['redeem']>((customerId, id, by, item) => send({ type: 'redeem', at: Date.now(), customerId, id, by, item }), [send]);

  const claimOffer = useCallback<Store['claimOffer']>(
    (customerId, offer) => {
      if (stateRef.current.cards[customerId]?.claimed.includes(offer.id)) return;
      const at = Date.now();
      const voucher = offer.reward ? newVoucher(at, offer.reward, { bn: `অফার: ${offer.title.bn}`, en: `Offer: ${offer.title.en}` }, offer.voucherDays ?? 7) : null;
      send({ type: 'claim', customerId, offerId: offer.id, voucher });
      if (offer.bonusStamps)
        addStamps(customerId, offer.bonusStamps, { detail: { bn: `বোনাস Stamp · ${offer.title.bn}`, en: `Bonus stamp · ${offer.title.en}` }, by: { bn: 'অফার', en: 'Offer' }, source: 'offer' });
    },
    [send, addStamps],
  );

  const addCustomer = useCallback<Store['addCustomer']>(
    (name, phone, by) => {
      const at = Date.now();
      const clean = name.trim();
      const first = Array.from(clean)[0] ?? '?';
      const customer: Customer = {
        id: `n${at.toString(36)}`,
        initial: { bn: first, en: first.toUpperCase() },
        name: { bn: clean, en: clean },
        phone,
        stamps: stateRef.current.program.welcome ? 1 : 0,
        visits: 1,
        last: TODAY,
        status: 'active',
        avatar: AVATARS[stateRef.current.added.length % AVATARS.length],
      };
      send({ type: 'customer', at, customer, by });
      return customer;
    },
    [send],
  );

  const saveProgram = useCallback<Store['saveProgram']>((program, by) => send({ type: 'program', at: Date.now(), program, by }), [send]);
  const saveOffer = useCallback<Store['saveOffer']>((offer) => send({ type: 'offer', offer }), [send]);
  const removeOffer = useCallback<Store['removeOffer']>((id) => send({ type: 'offer-remove', id }), [send]);
  const setOfferStatus = useCallback<Store['setOfferStatus']>((id, status) => send({ type: 'offer-status', id, status }), [send]);
  const setHours = useCallback<Store['setHours']>((outletId, hours) => send({ type: 'hours', outletId, hours }), [send]);
  const dismissUnlock = useCallback(() => send({ type: 'dismiss' }), [send]);

  const value = useMemo<Store>(() => {
    const customers = [...state.added, ...seedCustomers];
    return {
      ...state,
      customers,
      customer: (id) => customers.find((c) => c.id === id),
      findVoucher: (code) => {
        const key = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
        if (!key) return null;
        for (const [customerId, card] of Object.entries(state.cards)) {
          const voucher = card.vouchers.find((v) => v.code.replace(/[^a-z0-9]/gi, '').toUpperCase() === key);
          if (voucher) return { customerId, voucher };
        }
        return null;
      },
      addStamps,
      undoStamps,
      redeem,
      claimOffer,
      addCustomer,
      saveProgram,
      saveOffer,
      removeOffer,
      setOfferStatus,
      setHours,
      dismissUnlock,
    };
  }, [state, addStamps, undoStamps, redeem, claimOffer, addCustomer, saveProgram, saveOffer, removeOffer, setOfferStatus, setHours, dismissUnlock]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** The loyalty card as it is right now: the brand's card with the live program applied. */
export function useProgram() {
  const { program } = useStore();
  return useMemo(() => buildShop(shop, program), [program]);
}

/** The cashier's counters for today: the sample day plus what happened in this session. */
export function useToday() {
  const { live } = useStore();
  return {
    stamps: todayBaseline.stamps + live.stamps,
    rewards: todayBaseline.rewards + live.rewards,
    newCustomers: todayBaseline.newCustomers + live.newCustomers,
    cancelled: todayBaseline.cancelled + live.cancelled,
  };
}
