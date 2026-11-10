// Prisma CLI configuration. Migrations use the DIRECT (unpooled) Neon connection: schema changes need
// session-level features that a transaction pooler does not give. The app itself connects through the pooled
// DATABASE_URL (see src/server/db.ts).
//
// Next.js keeps secrets in .env.local, which Prisma does not read by itself, so load it here.
// On Vercel there is no .env.local: the variables come from the project settings and this is a no-op.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // react-server lets the seed import server-only modules the way Next does, without a bundler.
    seed: 'tsx --conditions react-server prisma/seed.ts',
  },
  datasource: {
    // `generate` and `validate` need no database, so a missing URL does not break them (CI, Vercel installs).
    // Commands that do need one stop with Prisma's own "datasource url is missing" error.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
