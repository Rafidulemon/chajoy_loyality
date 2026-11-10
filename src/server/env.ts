import 'server-only';
import { z } from 'zod';

/**
 * Environment, checked once on first use (not at import, so `next build` works without secrets) and checked hard:
 * a misconfigured server refuses to start answering instead of running with unsafe settings.
 * Error messages name variables, never values.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Pooled Neon connection string, used by the app. The CLI (migrations) uses DATABASE_URL_UNPOOLED, see prisma.config.ts. */
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    /** Test runs only: put every table in this Postgres schema instead of "public". */
    DATABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/, 'DATABASE_SCHEMA must be a plain lowercase identifier').optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    /** Keys the OTP hashes, the PIN hashes, the rotating member QR and the IP hashes. 32+ random characters. */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    /** The public origin, for the cross-site request check. Defaults to the origin of the request. */
    APP_ORIGIN: z.string().url().optional(),
    /** "sms": a random code goes out by SMS. "fixed": everyone uses DEV_OTP_CODE, development only. */
    OTP_MODE: z.enum(['fixed', 'sms']).default('sms'),
    DEV_OTP_CODE: z.string().regex(/^\d{6}$/, 'DEV_OTP_CODE must be exactly 6 digits').optional(),
    /** "console" prints messages on the server, so it never reaches a real phone. A gateway adapter comes with the contract. */
    SMS_PROVIDER: z.enum(['console']).default('console'),
    /** Lets the scheduler (Vercel Cron) call /api/cron/*. Without it those routes are off. */
    CRON_SECRET: z.string().min(24, 'CRON_SECRET must be at least 24 characters').optional(),
  })
  .superRefine((v, ctx) => {
    const production = v.NODE_ENV === 'production';
    if (v.OTP_MODE === 'fixed' && production) {
      ctx.addIssue({ code: 'custom', path: ['OTP_MODE'], message: 'OTP_MODE=fixed is for development only and is refused in production' });
    }
    if (v.OTP_MODE === 'fixed' && !v.DEV_OTP_CODE) {
      ctx.addIssue({ code: 'custom', path: ['DEV_OTP_CODE'], message: 'DEV_OTP_CODE is required when OTP_MODE=fixed' });
    }
    if (production && v.DEV_OTP_CODE) {
      ctx.addIssue({ code: 'custom', path: ['DEV_OTP_CODE'], message: 'DEV_OTP_CODE must not be set in production' });
    }
    if (production && v.SMS_PROVIDER === 'console') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'The console SMS provider cannot be used in production: connect an SMS gateway first' });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Invalid server configuration:\n${lines.join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change the environment between cases. */
export function resetEnvForTests() {
  cached = undefined;
}
