import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applies migrations with the ADMIN connection and provisions the low-privilege runtime role.
 * The runtime role (arena_app) is not a superuser and has no BYPASSRLS, so RLS always applies to it.
 */
export async function migrate(adminUrl: string, appPassword = 'arena_app'): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(appPassword)) throw new Error('APP_DB_PASSWORD must match [A-Za-z0-9_-]+');
  const client = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    // Serialise concurrent migrators (parallel test workers, multiple deploy replicas).
    await client`select pg_advisory_lock(727274)`;
    const exists = await client`select 1 from pg_roles where rolname = 'arena_app'`;
    if (exists.length === 0) {
      await client.unsafe(`create role arena_app login password '${appPassword}' nosuperuser nobypassrls`);
    }
    const [row] = await client`select current_database() as db`;
    await client.unsafe(`grant connect on database "${String(row?.db)}" to arena_app`);
    await drizzleMigrate(drizzle(client), { migrationsFolder: join(here, '../drizzle') });
  } finally {
    await client`select pg_advisory_unlock(727274)`.catch(() => {});
    await client.end({ timeout: 5 });
  }
}
