import { defineConfig } from 'drizzle-kit';

// Migrations live in ./drizzle. Generate with `npm run db:generate`, apply with
// `npm run db:migrate`. Reads DATABASE_URL from the environment (.env.local in
// dev / Vercel env in prod).
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
