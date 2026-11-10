/**
 * The loyalty program's rules as pure functions: no database, no clock, no framework. The server runs them inside its
 * transactions and they decide what is allowed; the apps reuse a few of them to preview the outcome (for example how many
 * more stamps fit today). Every rule carries its number from the business rules catalogue (section 12).
 */

/** A cashier can undo only straight after adding the stamps (BR-04). "Straight after" is ten minutes. */
export const UNDO_WINDOW_MS = 10 * 60_000;

/** A reward voucher from a full card is valid for 30 days from issue (BR-08). */
export const CARD_VOUCHER_DAYS = 30;

/** A member is "active" with a visit in the last 30 days, and "lapsed" (Not seen in 30 days) without one (section 15). */
export const ACTIVE_WINDOW_DAYS = 30;

export type StampMath = { stamps: number; completed: number };

/**
 * BR-07: a card holds `required` stamps. When it is full a voucher is issued and a new card starts, and extra stamps
 * carry over. `completed` is how many cards the change filled (more than one only for a big manual adjustment or
 * a program change). A negative `delta` takes stamps away and can never go below an empty card.
 */
export function applyStamps(current: number, delta: number, required: number): StampMath {
  if (!Number.isInteger(current) || current < 0) throw new RangeError('current stamps must be a whole number, 0 or more');
  if (!Number.isInteger(delta) || delta === 0) throw new RangeError('the change must be a whole number other than 0');
  if (!Number.isInteger(required) || required < 1) throw new RangeError('stamps per card must be a whole number, 1 or more');
  const total = current + delta;
  if (total < 0) throw new RangeError('a card cannot have fewer than 0 stamps');
  return { stamps: total % required, completed: Math.floor(total / required) };
}

/** Stamps still missing on the open card. */
export const cardRoom = (stamps: number, required: number) => Math.max(0, required - stamps);

/**
 * BR-02: the most a cashier can still give this customer today. `dailyLimit` 0 means no limit, which is Infinity here.
 * Only stamps from purchases count (BR-03); welcome stamps, offer stamps and manager adjustments do not.
 */
export const dailyRoom = (dailyLimit: number, givenToday: number) => (dailyLimit === 0 ? Infinity : Math.max(0, dailyLimit - givenToday));

export type VoucherStatus = 'ready' | 'used' | 'expired';

/** A voucher is never stored as expired: it is expired when it was not used and its date has passed (BR-08, BR-10). */
export function voucherStatus(v: { redeemedAt: Date | null; expiresAt: Date }, now: Date): VoucherStatus {
  if (v.redeemedAt) return 'used';
  return v.expiresAt.getTime() > now.getTime() ? 'ready' : 'expired';
}

export type UndoRefusal = 'NOT_A_PURCHASE' | 'ALREADY_UNDONE' | 'COMPLETED_CARD' | 'TOO_LATE' | 'NOT_LATEST' | 'NOT_YOURS' | 'CARD_CHANGED';

/**
 * BR-04: stamps can be undone only straight after they were added, and never when that action filled the card.
 * Later corrections are manager adjustments with a reason. Extra conditions that keep the ledger honest:
 * it must be the customer's latest entry (nothing happened since), a cashier can only cancel their own, and the card must still hold the stamps.
 */
export function checkUndo(input: {
  entry: { count: number; source: string; completedCards: number; createdAt: Date; staffId: string | null };
  alreadyUndone: boolean;
  isLatest: boolean;
  cardStamps: number;
  actor: { id: string; role: 'CASHIER' | 'MANAGER' | 'OWNER' };
  now: Date;
}): { ok: true } | { ok: false; reason: UndoRefusal } {
  const { entry, actor, now } = input;
  if (entry.source !== 'PURCHASE' || entry.count <= 0) return { ok: false, reason: 'NOT_A_PURCHASE' };
  if (input.alreadyUndone) return { ok: false, reason: 'ALREADY_UNDONE' };
  if (entry.completedCards > 0) return { ok: false, reason: 'COMPLETED_CARD' };
  if (now.getTime() - entry.createdAt.getTime() > UNDO_WINDOW_MS) return { ok: false, reason: 'TOO_LATE' };
  if (!input.isLatest) return { ok: false, reason: 'NOT_LATEST' };
  if (actor.role === 'CASHIER' && entry.staffId !== actor.id) return { ok: false, reason: 'NOT_YOURS' };
  if (input.cardStamps < entry.count) return { ok: false, reason: 'CARD_CHANGED' };
  return { ok: true };
}

/**
 * BR-13: lowering the stamps per card completes the cards of customers who already have enough, one voucher each time.
 * Raising it changes nobody. Used for the warning before saving (MG-09) and again when saving.
 */
export function programChangeImpact(cardStamps: number[], newRequired: number): { cards: number; vouchers: number } {
  let cards = 0;
  let vouchers = 0;
  for (const s of cardStamps) {
    const times = Math.floor(s / newRequired);
    if (times > 0) {
      cards += 1;
      vouchers += times;
    }
  }
  return { cards, vouchers };
}

/** The reward items a program offers, as a bilingual sentence part. Shared by voucher titles on the server and the card in the apps. */
export type RewardCatalogueItem = { id: string; name: { bn: string; en: string }; short: { bn: string; en: string } };

const joinList = (parts: string[], and: string) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`);

/** "free bubble tea, scoop or milkshake" for use inside a sentence. */
export function rewardText(items: RewardCatalogueItem[]): { bn: string; en: string } {
  if (!items.length) return { bn: 'একটি ফ্রি আইটেম', en: 'a free treat' };
  return { bn: `ফ্রি ${joinList(items.map((i) => i.short.bn), 'বা')}`, en: `free ${joinList(items.map((i) => i.short.en), 'or')}` };
}

/** "Free bubble tea, scoop or milkshake" for the title of a voucher. */
export function rewardTitle(items: RewardCatalogueItem[]): { bn: string; en: string } {
  const r = rewardText(items);
  return { bn: r.bn, en: r.en.charAt(0).toUpperCase() + r.en.slice(1) };
}
