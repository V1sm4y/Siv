import { auditLog, type AuditLogRow, type Tx } from '@arena/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { sha256Hex, stableStringify } from './crypto';

export interface AuditEntry {
  orgId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  /** Actions only an owner should see (e.g. ownership transfers). Hidden from managers. */
  ownerAction?: boolean;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

type HashInput = Pick<
  AuditLogRow,
  'orgId' | 'actorUserId' | 'action' | 'resourceType' | 'resourceId' | 'ownerAction' | 'metadata' | 'createdAt'
>;

export function computeAuditHash(prevHash: string | null, e: HashInput): string {
  return sha256Hex(
    stableStringify([
      prevHash,
      e.orgId,
      e.actorUserId,
      e.action,
      e.resourceType,
      e.resourceId,
      e.ownerAction,
      e.metadata,
      e.createdAt.toISOString(),
    ]),
  );
}

/**
 * Appends to the per-org hash chain. Must run inside the same transaction as the change it records,
 * so the record and the change commit or roll back together. Serialised per org with an advisory lock.
 */
export async function appendAudit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${e.orgId}, 0))`);
  const [last] = await tx
    .select({ hash: auditLog.hash, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(eq(auditLog.orgId, e.orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  // Strictly increasing timestamps keep the chain order unambiguous.
  let createdAt = new Date();
  if (last && createdAt.getTime() <= last.createdAt.getTime()) {
    createdAt = new Date(last.createdAt.getTime() + 1);
  }
  const row = {
    orgId: e.orgId,
    actorUserId: e.actorUserId,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId ?? null,
    ownerAction: e.ownerAction ?? false,
    metadata: e.metadata ?? {},
    createdAt,
  };
  const prevHash = last?.hash ?? null;
  await tx.insert(auditLog).values({
    ...row,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
    prevHash,
    hash: computeAuditHash(prevHash, row),
  });
}

/** Verifies an ascending run of entries (starting from a genesis or a known prevHash). */
export function verifyAuditChain(rows: AuditLogRow[]): { ok: true } | { ok: false; brokenAt: string } {
  let prev: string | null = rows[0]?.prevHash ?? null;
  for (const r of rows) {
    if (r.prevHash !== prev || computeAuditHash(prev, r) !== r.hash) return { ok: false, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true };
}

export async function listAudit(tx: Tx, orgId: string, opts: { limit: number; includeOwnerActions: boolean }) {
  return tx
    .select()
    .from(auditLog)
    .where(
      opts.includeOwnerActions
        ? eq(auditLog.orgId, orgId)
        : and(eq(auditLog.orgId, orgId), eq(auditLog.ownerAction, false)),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(opts.limit);
}
