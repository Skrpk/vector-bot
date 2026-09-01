// Apply Drizzle migrations WITHOUT drizzle-kit (which needs a native esbuild
// binary and breaks on Node arch mismatches). This uses Drizzle's programmatic
// migrator — pure JS over postgres.js — so it runs on any Node.
//
//   DATABASE_URL="postgres://…" node scripts/migrate.mjs
//
// Reads ./drizzle (the committed SQL migrations + journal).

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('✓ migrations applied');
} catch (err) {
  console.error('migration failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
