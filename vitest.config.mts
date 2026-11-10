import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two kinds of tests:
 *  - tests/unit: pure rules and helpers, no database, run in milliseconds.
 *  - tests/db: the real transactions (stamping, vouchers, offers, sign-in) against a throwaway Postgres schema that
 *    tests/setup/global.ts creates on the Neon database and drops afterwards, so real data is never touched.
 * Set VITEST_DB=0 to skip the database tests (for example in CI without a database).
 */
const root = import.meta.dirname;
const skipDb = process.env.VITEST_DB === '0';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // `server-only` throws outside Next's server build. Tests are server code, so give it an empty module.
      'server-only': path.resolve(root, 'tests/setup/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: skipDb ? ['tests/db/**', 'node_modules/**'] : ['node_modules/**'],
    globalSetup: skipDb ? [] : ['tests/setup/global.ts'],
    // The database tests share one schema, so run their files one after another.
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // DATABASE_URL and DATABASE_SCHEMA are set by the global setup for database tests; unit tests get a placeholder here.
    setupFiles: ['tests/setup/env.ts'],
    env: {
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret-test-secret-test-secret-0123456789',
      OTP_MODE: 'fixed',
      DEV_OTP_CODE: '135792',
      SMS_PROVIDER: 'console',
    },
  },
});
