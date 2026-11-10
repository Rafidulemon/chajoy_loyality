/**
 * Calendar days in Bangladesh. "Today" for the daily stamp limit, the cashier's counters and the visit rules is the day
 * in Asia/Dhaka, not in UTC. Bangladesh has no daylight saving time, so a fixed UTC+6 offset is exact.
 */

export const DAY = 86_400_000;
const DHAKA_OFFSET = 6 * 3_600_000;

/** The Dhaka calendar day of an instant, as "YYYY-MM-DD". */
export function dhakaDayKey(at: Date): string {
  return new Date(at.getTime() + DHAKA_OFFSET).toISOString().slice(0, 10);
}

/** The instant the Dhaka day containing `at` begins. */
export function dhakaDayStart(at: Date): Date {
  const shifted = at.getTime() + DHAKA_OFFSET;
  return new Date(Math.floor(shifted / DAY) * DAY - DHAKA_OFFSET);
}

/** The instant the next Dhaka day begins (exclusive end of the day containing `at`). */
export function dhakaDayEnd(at: Date): Date {
  return new Date(dhakaDayStart(at).getTime() + DAY);
}

/** A Date at UTC midnight that carries the Dhaka calendar day, which is what a Postgres DATE column wants. */
export function dhakaDateColumn(at: Date): Date {
  return new Date(`${dhakaDayKey(at)}T00:00:00.000Z`);
}

/** Minutes after midnight, Dhaka time. */
export function dhakaMinuteOfDay(at: Date): number {
  return Math.floor(((at.getTime() + DHAKA_OFFSET) % DAY) / 60_000);
}

export const addDays = (at: Date, days: number) => new Date(at.getTime() + days * DAY);

/** Whole days from `from` to `to`, rounded up, never below 0. Used for "3 days left". */
export function daysLeft(to: Date, from: Date = new Date()): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY));
}

/**
 * True when a birthday (a date; only month and day matter) falls in the 7 days that start today in Dhaka: the "birthday this week"
 * audience and offer (BR-18). Counts day by day, so a week that crosses New Year and a 29 February birthday both work.
 */
export function isBirthdayWeek(birthday: Date, now: Date): boolean {
  const start = dhakaDayStart(now).getTime() + 12 * 3_600_000; // noon of today in Dhaka, safely inside the day
  for (let i = 0; i < 7; i++) {
    const day = new Date(start + i * DAY + 6 * 3_600_000); // the same instant shifted so UTC fields read as the Dhaka date
    if (day.getUTCMonth() === birthday.getUTCMonth() && day.getUTCDate() === birthday.getUTCDate()) return true;
  }
  return false;
}

/** The start of the Dhaka day `n` days before the day containing `at`. */
export function dhakaDaysAgo(at: Date, n: number): Date {
  return new Date(dhakaDayStart(at).getTime() - n * DAY);
}
