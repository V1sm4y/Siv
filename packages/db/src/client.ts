import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Session variables read by the RLS policies (see drizzle/*_rls.sql). Empty string == unset. */
export interface TenantContext {
  orgId?: string;
  userId?: string;
  /** SHA-256 of an invite token being presented; lets RLS reveal exactly that invite row. */
  inviteTokenHash?: string;
  /** SHA-256 of a guardian-consent token being presented. */
  guardianTokenHash?: string;
}

const KEYS: Record<keyof TenantContext, string> = {
  orgId: 'app.org_id',
  userId: 'app.user_id',
  inviteTokenHash: 'app.invite_token_hash',
  guardianTokenHash: 'app.guardian_token_hash',
};

/** Sets transaction-local tenant variables. `set_config(..., true)` scopes them to the transaction. */
export async function setTenant(tx: Tx, ctx: TenantContext): Promise<void> {
  for (const key of Object.keys(KEYS) as (keyof TenantContext)[]) {
    if (key in ctx) {
      await tx.execute(sql`select set_config(${KEYS[key]}, ${ctx[key] ?? ''}, true)`);
    }
  }
}

/** Run `fn` inside a transaction with the tenant context applied. */
export async function withTenant<T>(db: Db, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenant(tx, { orgId: '', userId: '', inviteTokenHash: '', guardianTokenHash: '', ...ctx });
    return fn(tx);
  });
}
