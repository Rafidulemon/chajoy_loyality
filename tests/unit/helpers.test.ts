import { describe, expect, it } from 'vitest';
import { toCustomer } from '@/lib/api/adapters';
import { fromTime, hour12, toTime } from '@/lib/hours';
import { normalizeVoucherCode } from '@/lib/domain/codes';
import { formatPhone, maskPhone, normalizePhone, phoneSearchDigits } from '@/lib/domain/phone';
import { can, seesFullPhone } from '@/lib/domain/permissions';
import { smsInfo } from '@/lib/domain/sms';
import { dhakaDateColumn, dhakaDayEnd, dhakaDayKey, dhakaDayStart, dhakaMinuteOfDay } from '@/lib/domain/time';

describe('phone numbers', () => {
  it('normalises every way people write a Bangladeshi mobile number', () => {
    for (const input of ['01712345678', '1712345678', '+8801712345678', '8801712345678', '+880 1712-345678', '01712-345 678', '  017 1234 5678 ']) {
      expect(normalizePhone(input)).toBe('+8801712345678');
    }
  });

  it('understands Bangla digits', () => {
    expect(normalizePhone('০১৭১২৩৪৫৬৭৮')).toBe('+8801712345678');
  });

  it('rejects what is not a Bangladeshi mobile number', () => {
    for (const input of ['', '12345', '01212345678', '0171234567', '017123456789', '+4915112345678', 'abc']) {
      expect(normalizePhone(input)).toBeNull();
    }
  });

  it('formats and masks', () => {
    expect(formatPhone('+8801712345678')).toBe('+880 1712-345678');
    expect(maskPhone('+8801712345678')).toBe('+880 17XX-XXX678');
  });

  it('asks for at least 4 digits to search', () => {
    expect(phoneSearchDigits('123')).toBeNull();
    expect(phoneSearchDigits('5678')).toBe('5678');
    expect(phoneSearchDigits('০১৭১২')).toBe('01712');
  });
});

describe('voucher codes (CA-12)', () => {
  it('cleans up what a cashier types', () => {
    for (const input of ['CJ-4F7K-92QH', 'cj-4f7k-92qh', 'cj 4f7k 92qh', 'CJ4F7K92QH', ' cj-4f7k-92qh ', 'chajoy:voucher:CJ-4F7K-92QH']) {
      expect(normalizeVoucherCode(input)).toBe('CJ-4F7K-92QH');
    }
  });

  it('rejects text that cannot be a code, including letters the alphabet leaves out', () => {
    for (const input of ['', 'CJ-4F7K', 'XX-4F7K-92QH', 'CJ-4F7I-92QH', 'CJ-4F7K-02QH', 'CJ-4F7K-92QH9']) {
      expect(normalizeVoucherCode(input)).toBeNull();
    }
  });
});

describe('SMS parts (BR-23)', () => {
  it('counts plain English as GSM: 160 in one SMS, 153 per part when split', () => {
    expect(smsInfo('a'.repeat(160))).toMatchObject({ unicode: false, parts: 1, length: 160 });
    expect(smsInfo('a'.repeat(161))).toMatchObject({ unicode: false, parts: 2 });
    expect(smsInfo('a'.repeat(306))).toMatchObject({ parts: 2 });
    expect(smsInfo('a'.repeat(307))).toMatchObject({ parts: 3 });
  });

  it('counts a Bangla message as Unicode: 70 in one SMS, 67 per part when split', () => {
    expect(smsInfo('অ'.repeat(70))).toMatchObject({ unicode: true, parts: 1, length: 70 });
    expect(smsInfo('অ'.repeat(71))).toMatchObject({ unicode: true, parts: 2 });
    expect(smsInfo('অ'.repeat(134))).toMatchObject({ parts: 2 });
    expect(smsInfo('অ'.repeat(135))).toMatchObject({ parts: 3 });
  });

  it('switches the whole message to Unicode for one non-GSM character', () => {
    expect(smsInfo('Hello ’world’').unicode).toBe(true);
    expect(smsInfo('ChaJoy: ডাবল Stamp শুক্রবার').unicode).toBe(true);
  });

  it('counts the extended GSM characters twice', () => {
    expect(smsInfo('{}').length).toBe(4);
    expect(smsInfo('a'.repeat(159) + '€').parts).toBe(2);
  });

  it('is empty for an empty message', () => {
    expect(smsInfo('').parts).toBe(0);
  });
});

describe('days in Dhaka', () => {
  it('uses the Dhaka calendar day, not the UTC day', () => {
    // 18:30 UTC on 9 Nov is 00:30 on 10 Nov in Dhaka
    const lateEvening = new Date('2026-11-09T18:30:00Z');
    expect(dhakaDayKey(lateEvening)).toBe('2026-11-10');
    expect(dhakaDayStart(lateEvening).toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(dhakaDayEnd(lateEvening).toISOString()).toBe('2026-11-10T18:00:00.000Z');
    expect(dhakaMinuteOfDay(lateEvening)).toBe(30);
  });

  it('keeps a Dhaka afternoon on the same day in both calendars', () => {
    const afternoon = new Date('2026-11-09T08:00:00Z'); // 14:00 Dhaka
    expect(dhakaDayKey(afternoon)).toBe('2026-11-09');
    expect(dhakaDateColumn(afternoon).toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  it('starts the day at exactly midnight in Dhaka', () => {
    expect(dhakaDayStart(new Date('2026-11-09T18:00:00Z')).toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(dhakaDayStart(new Date('2026-11-09T17:59:59Z')).toISOString()).toBe('2026-11-08T18:00:00.000Z');
  });
});

describe('permissions (MG-22)', () => {
  it('lets every role work the counter', () => {
    for (const role of ['CASHIER', 'MANAGER', 'OWNER'] as const) expect(can(role, 'counter.work')).toBe(true);
  });

  it('keeps manual adjustments, offers and SMS from cashiers', () => {
    for (const p of ['stamps.adjust', 'offers.manage', 'sms.send', 'customers.list', 'dashboard.view', 'limit.override'] as const) {
      expect(can('CASHIER', p)).toBe(false);
      expect(can('MANAGER', p)).toBe(true);
    }
  });

  it('keeps program rules, staff, outlets and exports for the owner only', () => {
    for (const p of ['program.edit', 'staff.manage', 'outlets.manage', 'customers.export', 'audit.view'] as const) {
      expect(can('MANAGER', p)).toBe(false);
      expect(can('OWNER', p)).toBe(true);
    }
  });

  it('masks phone numbers only for cashiers', () => {
    expect(seesFullPhone('CASHIER')).toBe(false);
    expect(seesFullPhone('MANAGER')).toBe(true);
  });
});

describe('opening hours text', () => {
  it('writes 12-hour times, and a close at midnight (stored as 24:00) as 12 AM', () => {
    expect(hour12(660)).toBe('11 AM');
    expect(hour12(1380)).toBe('11 PM');
    expect(hour12(630)).toBe('10:30 AM');
    expect(hour12(720)).toBe('12 PM');
    expect(hour12(0)).toBe('12 AM');
    expect(hour12(1440)).toBe('12 AM');
  });

  it('converts to and from the value of a time box', () => {
    expect(toTime(660)).toBe('11:00');
    expect(toTime(1350)).toBe('22:30');
    expect(fromTime('23:30')).toBe(1410);
    expect(fromTime('')).toBe(0);
  });
});

describe('customers in a list', () => {
  const row = { id: 'x', memberNo: 7, name: 'Nadia', phone: '+8801712345678', stamps: 2, visits: 0, rewardsEarned: 0, lastVisitAt: null, joinedAt: '2026-10-01T05:00:00.000Z', hasReadyVoucher: false, status: 'active' as const };
  const now = Date.parse('2026-11-09T05:00:00Z');

  it('says "No visit yet" for someone who has never been in, not the days since they joined', () => {
    expect(toCustomer(row, now).last).toEqual({ bn: 'এখনো আসেননি', en: 'No visit yet' });
  });

  it('says how long ago the last visit was', () => {
    expect(toCustomer({ ...row, visits: 3, lastVisitAt: '2026-11-07T05:00:00.000Z' }, now).last.en).toBe('2 days ago');
  });
});
