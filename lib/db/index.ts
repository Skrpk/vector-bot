import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazily-created Postgres connection via postgres.js, shared across serverless
// invocations on a warm instance. Works identically against a local Docker
// Postgres (dev) and Neon's pooled connection string (Vercel prod) — same wire
// protocol, so `DATABASE_URL` is the only thing that changes.
//
// Lazy so importing this module never opens a connection (or throws on a missing
// DATABASE_URL) at build time / for routes that don't touch the DB. `max: 1`
// keeps each instance to one connection; the pooler handles cross-instance
// concurrency.

declare global {
  var __vectorDbClient: ReturnType<typeof postgres> | undefined;
}

let dbInstance: PostgresJsDatabase<typeof schema> | undefined;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (dbInstance) return dbInstance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot connect to the database.');
  }
  const client = globalThis.__vectorDbClient ?? postgres(connectionString, { max: 1 });
  if (process.env.NODE_ENV !== 'production') globalThis.__vectorDbClient = client;
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export { schema };
