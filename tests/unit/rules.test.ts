import { describe, expect, it } from 'vitest';
import { applyStamps, cardRoom, checkUndo, dailyRoom, programChangeImpact, rewardText, rewardTitle, UNDO_WINDOW_MS, voucherStatus } from '@/lib/domain/rules';

describe('applyStamps (BR-07)', () => {
  it('adds stamps to the open card', () => {
    expect(applyStamps(3, 2, 10)).toEqual({ stamps: 5, completed: 0 });
  });

  it('fills the card exactly: a voucher is issued and a new card starts empty', () => {
    expect(applyStamps(8, 2, 10)).toEqual({ stamps: 0, completed: 1 });
  });

  it('carries extra stamps over to the new card', () => {
    expect(applyStamps(9, 4, 10)).toEqual({ stamps: 3, completed: 1 });
  });

  it('can fill more than one card at once (a big manual adjustment)', () => {
    expect(applyStamps(5, 27, 10)).toEqual({ stamps: 2, completed: 3 });
  });

  it('takes stamps away without going below an empty card', () => {
    expect(applyStamps(5, -3, 10)).toEqual({ stamps: 2, completed: 0 });
    expect(() => applyStamps(2, -3, 10)).toThrow(RangeError);
  });

  it('works for any card size the program allows', () => {
    expect(applyStamps(3, 1, 4)).toEqual({ stamps: 0, completed: 1 });
    expect(applyStamps(19, 1, 20)).toEqual({ stamps: 0, completed: 1 });
  });

  it('rejects input that cannot be a stamp change', () => {
    expect(() => applyStamps(-1, 1, 10)).toThrow(RangeError);
    expect(() => applyStamps(1, 0, 10)).toThrow(RangeError);
    expect(() => applyStamps(1, 1.5, 10)).toThrow(RangeError);
    expect(() => applyStamps(1, 1, 0)).toThrow(RangeError);
  });

  it('never loses or invents a stamp: stamps + completed cards x size = old stamps + change', () => {
    for (const required of [4, 7, 10, 20]) {
      for (let current = 0; current < required; current++) {
        for (const delta of [1, 2, 3, required - current, required, required + 3, 2 * required + 1]) {
          const r = applyStamps(current, delta, required);
          expect(r.stamps + r.completed * required).toBe(current + delta);
          expect(r.stamps).toBeGreaterThanOrEqual(0);
          expect(r.stamps).toBeLessThan(required);
        }
      }
    }
  });
});

describe('daily limit (BR-02)', () => {
  it('allows what is left of the limit', () => {
    expect(dailyRoom(2, 0)).toBe(2);
    expect(dailyRoom(2, 1)).toBe(1);
    expect(dailyRoom(2, 2)).toBe(0);
  });

  it('never goes negative when more was given (for example after a limit change)', () => {
    expect(dailyRoom(2, 5)).toBe(0);
  });

  it('has no limit when the program says 0', () => {
    expect(dailyRoom(0, 999)).toBe(Infinity);
  });
});

describe('cardRoom', () => {
  it('is how many stamps the open card still needs', () => {
    expect(cardRoom(7, 10)).toBe(3);
    expect(cardRoom(0, 10)).toBe(10);
  });
});

describe('voucherStatus (BR-08, BR-10)', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const future = new Date('2026-11-20T00:00:00Z');
  const past = new Date('2026-11-01T00:00:00Z');

  it('is ready until it is used or its date passes', () => {
    expect(voucherStatus({ redeemedAt: null, expiresAt: future }, now)).toBe('ready');
  });
  it('is expired when unused after its date', () => {
    expect(voucherStatus({ redeemedAt: null, expiresAt: past }, now)).toBe('expired');
  });
  it('is expired at the exact moment it ends', () => {
    expect(voucherStatus({ redeemedAt: null, expiresAt: now }, now)).toBe('expired');
  });
  it('stays used even after its date passes', () => {
    expect(voucherStatus({ redeemedAt: new Date('2026-10-30T00:00:00Z'), expiresAt: past }, now)).toBe('used');
  });
});

describe('checkUndo (BR-04)', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const base = {
    entry: { count: 1, source: 'PURCHASE', completedCards: 0, createdAt: new Date(now.getTime() - 60_000), staffId: 'cashier-1' },
    alreadyUndone: false,
    isLatest: true,
    cardStamps: 4,
    actor: { id: 'cashier-1', role: 'CASHIER' as const },
    now,
  };

  it('allows the cashier to undo their own stamps straight after adding them', () => {
    expect(checkUndo(base)).toEqual({ ok: true });
  });

  it('refuses stamps that were not a counter purchase', () => {
    expect(checkUndo({ ...base, entry: { ...base.entry, source: 'ADJUSTMENT' } })).toEqual({ ok: false, reason: 'NOT_A_PURCHASE' });
    expect(checkUndo({ ...base, entry: { ...base.entry, count: -1 } })).toEqual({ ok: false, reason: 'NOT_A_PURCHASE' });
  });

  it('refuses a second undo', () => {
    expect(checkUndo({ ...base, alreadyUndone: true })).toEqual({ ok: false, reason: 'ALREADY_UNDONE' });
  });

  it('refuses when the stamps completed the card', () => {
    expect(checkUndo({ ...base, entry: { ...base.entry, completedCards: 1 } })).toEqual({ ok: false, reason: 'COMPLETED_CARD' });
  });

  it('refuses after the undo window', () => {
    const old = { ...base.entry, createdAt: new Date(now.getTime() - UNDO_WINDOW_MS - 1) };
    expect(checkUndo({ ...base, entry: old })).toEqual({ ok: false, reason: 'TOO_LATE' });
    const edge = { ...base.entry, createdAt: new Date(now.getTime() - UNDO_WINDOW_MS) };
    expect(checkUndo({ ...base, entry: edge })).toEqual({ ok: true });
  });

  it('refuses when something else happened on the card since', () => {
    expect(checkUndo({ ...base, isLatest: false })).toEqual({ ok: false, reason: 'NOT_LATEST' });
  });

  it('lets only the same cashier undo, but a manager or owner can undo anyone within the window', () => {
    expect(checkUndo({ ...base, actor: { id: 'cashier-2', role: 'CASHIER' } })).toEqual({ ok: false, reason: 'NOT_YOURS' });
    expect(checkUndo({ ...base, actor: { id: 'manager-1', role: 'MANAGER' } })).toEqual({ ok: true });
    expect(checkUndo({ ...base, actor: { id: 'owner-1', role: 'OWNER' } })).toEqual({ ok: true });
  });

  it('refuses when the card no longer holds the stamps', () => {
    expect(checkUndo({ ...base, cardStamps: 0 })).toEqual({ ok: false, reason: 'CARD_CHANGED' });
  });
});

describe('programChangeImpact (BR-13)', () => {
  it('counts the cards that a smaller card completes, and the vouchers', () => {
    expect(programChangeImpact([3, 7, 9, 12], 8)).toEqual({ cards: 2, vouchers: 2 });
  });
  it('issues several vouchers to a card that holds several cards worth', () => {
    expect(programChangeImpact([9], 4)).toEqual({ cards: 1, vouchers: 2 });
  });
  it('changes nobody when the card gets bigger', () => {
    expect(programChangeImpact([3, 7, 9], 12)).toEqual({ cards: 0, vouchers: 0 });
  });
});

describe('reward text', () => {
  const items = [
    { id: 'bubble-tea', name: { bn: 'বাবল টি', en: 'Bubble tea' }, short: { bn: 'বাবল টি', en: 'bubble tea' } },
    { id: 'scoop', name: { bn: 'স্কুপ আইসক্রিম', en: 'Ice cream scoop' }, short: { bn: 'আইসক্রিম', en: 'scoop' } },
    { id: 'milkshake', name: { bn: 'মিল্কশেক', en: 'Milkshake' }, short: { bn: 'মিল্কশেক', en: 'milkshake' } },
  ];
  it('lists the items in a sentence', () => {
    expect(rewardText(items).en).toBe('free bubble tea, scoop or milkshake');
    expect(rewardText(items.slice(0, 1)).en).toBe('free bubble tea');
  });
  it('writes the voucher title with a capital', () => {
    expect(rewardTitle(items).en).toBe('Free bubble tea, scoop or milkshake');
  });
  it('has a fallback when no item is left', () => {
    expect(rewardText([]).en).toBe('a free treat');
  });
});
