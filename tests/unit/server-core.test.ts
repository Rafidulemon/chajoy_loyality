import { afterEach, describe, expect, it } from 'vitest';
import { signMemberQr, verifyMemberQr, QR_TTL_SEC } from '@/server/auth/qr';
import { generateVoucherCode, hashPin, hmac, safeEqual, verifyPin } from '@/server/crypto';
import { env, resetEnvForTests } from '@/server/env';
import { normalizeVoucherCode } from '@/lib/domain/codes';

const CUSTOMER = '0195e1c2-7b3a-7c10-9d2e-123456789abc';

describe('member QR (NF-07)', () => {
  const now = new Date('2026-11-09T10:00:00Z');

  it('verifies a fresh token and returns the customer', () => {
    const { token } = signMemberQr(CUSTOMER, now);
    expect(verifyMemberQr(token, now)).toBe(CUSTOMER);
  });

  it('is short enough for a QR on a phone screen', () => {
    expect(signMemberQr(CUSTOMER, now).token.length).toBeLessThan(90);
  });

  it('stops working after 90 seconds, so a copied screenshot is useless', () => {
    const { token } = signMemberQr(CUSTOMER, now);
    expect(verifyMemberQr(token, new Date(now.getTime() + (QR_TTL_SEC - 1) * 1000))).toBe(CUSTOMER);
    expect(() => verifyMemberQr(token, new Date(now.getTime() + (QR_TTL_SEC + 1) * 1000))).toThrow();
  });

  it('cannot be forged or edited', () => {
    const { token } = signMemberQr(CUSTOMER, now);
    const [v, id, exp, sig] = token.split('.');
    const otherCustomer = '0195e1c2-7b3a-7c10-9d2e-000000000000';
    expect(() => verifyMemberQr([v, otherCustomer, exp, sig].join('.'), now)).toThrow();
    expect(() => verifyMemberQr([v, id, (parseInt(exp, 36) + 600).toString(36), sig].join('.'), now)).toThrow();
    expect(() => verifyMemberQr([v, id, exp, sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')].join('.'), now)).toThrow();
    for (const junk of ['', 'abc', 'CJ1..', `CJ1.${id}.${exp}`, `CJ2.${id}.${exp}.${sig}`, `${token}.extra`]) {
      expect(() => verifyMemberQr(junk, now)).toThrow();
    }
  });

  it('gives a different token to each customer', () => {
    expect(signMemberQr(CUSTOMER, now).token).not.toBe(signMemberQr('0195e1c2-7b3a-7c10-9d2e-999999999999', now).token);
  });
});

describe('PINs', () => {
  it('accepts the right PIN and refuses a wrong one', async () => {
    const stored = await hashPin('246810');
    expect(await verifyPin('246810', stored)).toBe(true);
    expect(await verifyPin('246811', stored)).toBe(false);
  });

  it('salts every hash, so two staff with the same PIN do not look the same', async () => {
    const [a, b] = await Promise.all([hashPin('246810'), hashPin('246810')]);
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('refuses when nothing is stored or the stored value is damaged', async () => {
    expect(await verifyPin('246810', null)).toBe(false);
    expect(await verifyPin('246810', 'not-a-hash')).toBe(false);
    expect(await verifyPin('246810', 'scrypt$1$2$3$4')).toBe(false);
  });

  it('never stores the PIN itself', async () => {
    expect(await hashPin('246810')).not.toContain('246810');
  });
});

describe('hashing helpers', () => {
  it('compares strings of different length without throwing', () => {
    expect(safeEqual('a', 'abc')).toBe(false);
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('', '')).toBe(true);
  });

  it('keeps hashes for different purposes apart', () => {
    expect(hmac('otp', 'x')).not.toBe(hmac('qr', 'x'));
    expect(hmac('otp', 'x')).toBe(hmac('otp', 'x'));
  });
});

describe('voucher codes', () => {
  it('has the CJ-XXXX-XXXX shape and only the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(generateVoucherCode()).toMatch(/^CJ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('does not repeat in a realistic run and survives the cashier typing round trip', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const code = generateVoucherCode();
      expect(seen.has(code)).toBe(false);
      seen.add(code);
      expect(normalizeVoucherCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    }
  });
});

describe('environment check', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvForTests();
  });

  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvForTests();
  };

  it('accepts the development setup', () => {
    expect(env().OTP_MODE).toBe('fixed');
  });

  it('refuses the fixed OTP in production, which would let anyone sign in', () => {
    set({ NODE_ENV: 'production' });
    expect(() => env()).toThrow(/OTP_MODE=fixed is for development only/);
  });

  it('refuses a DEV_OTP_CODE in production even when OTP_MODE is sms', () => {
    set({ NODE_ENV: 'production', OTP_MODE: 'sms' });
    expect(() => env()).toThrow(/DEV_OTP_CODE must not be set in production/);
  });

  it('refuses the console SMS provider in production, where codes would never reach a phone', () => {
    set({ NODE_ENV: 'production', OTP_MODE: 'sms', DEV_OTP_CODE: undefined });
    expect(() => env()).toThrow(/console SMS provider cannot be used in production/);
  });

  it('needs a code when the OTP is fixed', () => {
    set({ DEV_OTP_CODE: undefined });
    expect(() => env()).toThrow(/DEV_OTP_CODE is required/);
  });

  it('needs a long secret', () => {
    set({ AUTH_SECRET: 'short' });
    expect(() => env()).toThrow(/AUTH_SECRET/);
  });

  it('names the problem variables but never prints their values', () => {
    set({ AUTH_SECRET: 'super-secret-but-too-short', DEV_OTP_CODE: '12' });
    let message = '';
    try {
      env();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('AUTH_SECRET');
    expect(message).not.toContain('super-secret-but-too-short');
  });
});
