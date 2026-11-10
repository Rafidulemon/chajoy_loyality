import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

/**
 * Runs once before the database tests: creates a schema just for this run on the real database, applies every migration
 * into it and points the app's DATABASE_SCHEMA at it. After the run the schema is dropped, so tests can create and destroy
 * whatever they like without ever touching the data in the `public` schema.
 */
loadEnv({ path: ['.env.local', '.env'], quiet: true });

const root = path.resolve(__dirname, '../..');
const schema = `test_${randomBytes(6).toString('hex')}`;

function direct(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('The database tests need DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env.local. Run with VITEST_DB=0 to skip them.');
  const u = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) u.searchParams.set('sslmode', 'verify-full');
  return u.toString();
}

export async function setup() {
  const url = direct();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const dir = path.join(root, 'prisma', 'migrations');
    const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    for (const name of migrations) {
      await client.query(readFileSync(path.join(dir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
  // The app code reads these. The direct (unpooled) endpoint keeps `search_path` per connection reliable.
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SCHEMA = schema;
  console.log(`[tests] using throwaway schema ${schema}`);
}

export async function teardown() {
  const client = new Client({ connectionString: direct() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    console.log(`[tests] dropped schema ${schema}`);
  } finally {
    await client.end();
  }
}
