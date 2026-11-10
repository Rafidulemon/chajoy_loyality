/**
 * The loyalty program management sets up: how many stamps earn a reward, what the reward can be, the earning rules
 * and the card colour. The server holds the live copy (GET /api/program), and `buildShop` turns it into the card settings
 * the customer, cashier and owner screens draw from. The reward items and card colours below are the one catalogue the
 * program refers to by id: the screens draw from it and the server validates against the same list.
 */

import type { Shop } from './data';
import type { Text } from './i18n';

const t = (bn: string, en: string): Text => ({ bn, en });

/** One of the items a customer can pick as their free reward. */
export type RewardItem = { id: string; name: Text; short: Text; chip: string };

export const REWARD_ITEMS: RewardItem[] = [
  { id: 'bubble-tea', name: t('বাবল টি', 'Bubble tea'), short: t('বাবল টি', 'bubble tea'), chip: '#7FCBFF' },
  { id: 'scoop', name: t('স্কুপ আইসক্রিম', 'Ice cream scoop'), short: t('আইসক্রিম', 'scoop'), chip: '#F5D900' },
  { id: 'milkshake', name: t('মিল্কশেক', 'Milkshake'), short: t('মিল্কশেক', 'milkshake'), chip: '#FF8A9A' },
  { id: 'sundae', name: t('সানডে', 'Sundae'), short: t('সানডে', 'sundae'), chip: '#FF8FB1' },
];

/** The colours a loyalty card can have, with the stamp and decoration colours that suit each one. */
export type CardColor = { id: string; name: Text; color: string; fg: string; dark: boolean; stampBg: string; stampFg: string; dash: string; deco1: string; deco2: string };

export const CARD_COLORS: CardColor[] = [
  { id: 'lime', name: t('লাইম', 'Lime'), color: '#97C334', fg: '#171717', dark: false, stampBg: '#171717', stampFg: '#F5D900', dash: 'rgba(23,23,23,0.5)', deco1: 'rgba(245,217,0,0.9)', deco2: 'rgba(255,93,115,0.85)' },
  { id: 'green', name: t('সবুজ', 'Green'), color: '#668C1F', fg: '#FFFFFF', dark: true, stampBg: '#F5D900', stampFg: '#171717', dash: 'rgba(255,255,255,0.6)', deco1: 'rgba(151,195,52,0.9)', deco2: 'rgba(245,217,0,0.75)' },
  { id: 'yellow', name: t('হলুদ', 'Yellow'), color: '#F5D900', fg: '#171717', dark: false, stampBg: '#171717', stampFg: '#F5D900', dash: 'rgba(23,23,23,0.5)', deco1: 'rgba(151,195,52,0.9)', deco2: 'rgba(255,255,255,0.55)' },
  { id: 'black', name: t('কালো', 'Black'), color: '#171717', fg: '#FFFFFF', dark: true, stampBg: '#97C334', stampFg: '#171717', dash: 'rgba(255,255,255,0.55)', deco1: 'rgba(151,195,52,0.85)', deco2: 'rgba(245,217,0,0.75)' },
  { id: 'rose', name: t('গোলাপি', 'Rose'), color: '#FF8A9A', fg: '#171717', dark: false, stampBg: '#171717', stampFg: '#F5D900', dash: 'rgba(23,23,23,0.5)', deco1: 'rgba(245,217,0,0.9)', deco2: 'rgba(151,195,52,0.7)' },
];

export type Program = {
  /** Shown on the card under the brand name. */
  name: Text;
  /** Stamps that earn a reward. */
  total: number;
  /** Ids from REWARD_ITEMS that customers can pick from. */
  items: string[];
  /** Minimum purchase, in taka, for a stamp. */
  minPurchase: number;
  /** Most stamps a customer gets per day at the counter. 0 means no limit. */
  dailyLimit: number;
  /** Days before a stamp expires. 0 means never. */
  expiryDays: number;
  /** Whether a new customer starts with one free stamp. */
  welcome: boolean;
  /** Index into CARD_COLORS. */
  color: number;
};

export const defaultProgram: Program = {
  name: t('লয়্যালটি কার্ড', 'Loyalty card'),
  total: 10,
  items: ['bubble-tea', 'scoop', 'milkshake'],
  minPurchase: 200,
  dailyLimit: 2,
  expiryDays: 90,
  welcome: true,
  color: 0,
};

/** The reward items a program offers, in the usual order. */
export const itemsOf = (p: Program) => REWARD_ITEMS.filter((i) => p.items.includes(i.id));

const joinList = (parts: string[], and: string) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`);

/** "free bubble tea, scoop or milkshake", for use inside a sentence. */
export function rewardText(items: RewardItem[]): Text {
  if (!items.length) return t('একটি ফ্রি আইটেম', 'a free treat');
  return t(`ফ্রি ${joinList(items.map((i) => i.short.bn), 'বা')}`, `free ${joinList(items.map((i) => i.short.en), 'or')}`);
}

/** "Free bubble tea, scoop or milkshake", for the title of a voucher. */
export function rewardTitleFor(items: RewardItem[]): Text {
  const r = rewardText(items);
  return { bn: r.bn, en: r.en.charAt(0).toUpperCase() + r.en.slice(1) };
}

/** The card settings every screen draws from: the brand's base card with this program applied. */
export type ProgramShop = Shop & { program: Program; items: RewardItem[]; title: Text; colorName: Text };

export function buildShop(base: Shop, p: Program): ProgramShop {
  const items = itemsOf(p);
  const c = CARD_COLORS[p.color] ?? CARD_COLORS[0];
  return {
    ...base,
    cardName: p.name,
    total: p.total,
    reward: rewardText(items),
    rewardItems: items.map((i) => i.name),
    color: c.color,
    fg: c.fg,
    dark: c.dark,
    stampBg: c.stampBg,
    stampFg: c.stampFg,
    dash: c.dash,
    deco1: c.deco1,
    deco2: c.deco2,
    program: p,
    items,
    title: rewardTitleFor(items),
    colorName: c.name,
  };
}
