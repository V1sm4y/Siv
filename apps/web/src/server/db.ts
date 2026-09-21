import 'server-only';
import { env } from '@arena/config';
import { createDb, type Db } from '@arena/db';

const g = globalThis as unknown as { __arenaDb?: ReturnType<typeof createDb> };

/** One pool per process, reused across dev HMR reloads. Runtime role only (RLS applies). */
export function getDb(): Db {
  return (g.__arenaDb ??= createDb(env().DATABASE_URL, { max: 10 })).db;
}
