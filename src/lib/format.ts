/**
 * Display helpers for dates, times and digits. Every day and time is shown in Bangladesh time (Asia/Dhaka), whatever the
 * device's own time zone is, so the cashier, the customer and management all read the same clock as the server's "today".
 */
import type { Text } from './i18n';
import { DAY, dhakaDayStart } from './domain/time';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const DHAKA = 6 * 3_600_000;

const MONTHS: Text[] = [
  { bn: 'জানুয়ারি', en: 'Jan' }, { bn: 'ফেব্রুয়ারি', en: 'Feb' }, { bn: 'মার্চ', en: 'Mar' }, { bn: 'এপ্রিল', en: 'Apr' },
  { bn: 'মে', en: 'May' }, { bn: 'জুন', en: 'Jun' }, { bn: 'জুলাই', en: 'Jul' }, { bn: 'আগস্ট', en: 'Aug' },
  { bn: 'সেপ্টেম্বর', en: 'Sep' }, { bn: 'অক্টোবর', en: 'Oct' }, { bn: 'নভেম্বর', en: 'Nov' }, { bn: 'ডিসেম্বর', en: 'Dec' },
];
const MONTHS_LONG_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Western digits to Bangla digits in a string. */
export const bnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

const dhaka = (ms: number) => new Date(ms + DHAKA); // read with the getUTC* methods

/** 1731000000000 -> "7 Nov" / "৭ নভেম্বর" */
export function day(ms: number): Text {
  const d = dhaka(ms);
  const m = MONTHS[d.getUTCMonth()];
  return { bn: `${bnDigits(String(d.getUTCDate()))} ${m.bn}`, en: `${d.getUTCDate()} ${m.en}` };
}

/** 1731000000000 -> "4:10 PM" / "৪:১০ PM" */
export function clock(ms: number): Text {
  const d = dhaka(ms);
  const h = d.getUTCHours();
  const en = `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return { bn: bnDigits(en), en };
}

/** A month heading for grouping a timeline: "Today" for today, otherwise the month name (with the year when it is not this year). */
export function groupLabel(ms: number, now = Date.now()): Text {
  if (dhakaDayStart(new Date(ms)).getTime() === dhakaDayStart(new Date(now)).getTime()) return { bn: 'আজ', en: 'Today' };
  const d = dhaka(ms);
  const thisYear = dhaka(now).getUTCFullYear();
  const year = d.getUTCFullYear();
  const m = MONTHS[d.getUTCMonth()];
  return year === thisYear
    ? { bn: m.bn, en: MONTHS_LONG_EN[d.getUTCMonth()] }
    : { bn: `${m.bn} ${bnDigits(String(year))}`, en: `${MONTHS_LONG_EN[d.getUTCMonth()]} ${year}` };
}

/** "Today", "Yesterday", "5 days ago": how long since something, in whole Dhaka days. Null becomes a dash. */
export function relativeDays(ms: number | null, now = Date.now()): Text {
  if (ms === null) return { bn: '—', en: '—' };
  const days = Math.max(0, Math.round((dhakaDayStart(new Date(now)).getTime() - dhakaDayStart(new Date(ms)).getTime()) / DAY));
  if (days === 0) return { bn: 'আজ', en: 'Today' };
  if (days === 1) return { bn: 'গতকাল', en: 'Yesterday' };
  return { bn: `${bnDigits(String(days))} দিন আগে`, en: `${days} days ago` };
}

/** Whole days from now until `ms`, never below 0 ("3 days left"). */
export const daysUntil = (ms: number, now = Date.now()) => Math.max(0, Math.ceil((ms - now) / DAY));

/** The next time a "YYYY-MM-DD" birthday comes round, as "12 March". Used for the birthday offer's unlock date. */
export function nextBirthday(birthday: string, now = Date.now()): Text {
  const [, mm, dd] = birthday.split('-').map(Number);
  const year = dhaka(now).getUTCFullYear();
  let at = Date.UTC(year, mm - 1, dd) - DHAKA;
  if (at < dhakaDayStart(new Date(now)).getTime()) at = Date.UTC(year + 1, mm - 1, dd) - DHAKA;
  return day(at + 12 * 3_600_000);
}

/** A stable colour for a person's avatar, picked from the brand palette by their id. */
const AVATARS = ['#97C334', '#F5D900', '#FF8A9A', '#8FE3D8', '#7FCBFF', '#FF8FB1', '#7FD8CE'];
export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/** First letter of a name for an avatar, in both scripts. */
export function initialOf(name: string | null): Text {
  const first = Array.from((name ?? '').trim())[0] ?? '?';
  return { bn: first, en: first.toUpperCase() };
}
