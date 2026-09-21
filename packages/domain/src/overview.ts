import { auditLog, invites, memberships, teamMemberships, users } from '@arena/db';
import { can } from '@arena/authz';
import { and, count, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { OrgScope } from './scope';

export interface ActivityDay {
  /** YYYY-MM-DD in the requested timezone. */
  day: string;
  count: number;
}

export interface OrgOverview {
  /** Roster size per team the caller can see. */
  rosterCounts: Record<string, number>;
  /** Owner/manager only. */
  management: null | {
    memberCount: number;
    pendingInvites: number;
    roleCounts: { role: string; count: number }[];
  };
  /** Audit-log derived; only for callers allowed to read the audit log. */
  activity: null | {
    days: ActivityDay[];
    total: number;
    recent: { id: string; action: string; actorName: string | null; createdAt: Date; metadata: Record<string, unknown> }[];
  };
}

/** Local calendar days ending today, oldest first, in an IANA timezone (falls back to UTC). */
export function lastDays(n: number, timeZone: string, now: Date = new Date()): string[] {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(fmt.format(new Date(now.getTime() - i * 86_400_000)));
  return out;
}

/**
 * Everything on the overview page comes from stored rows. Nothing is estimated or padded: days with no
 * events are zero, and callers without permission get `null` sections (not fake numbers).
 */
export async function getOrgOverview(
  scope: OrgScope,
  opts: { teamIds: string[]; timeZone: string; days?: number },
): Promise<OrgOverview> {
  const { tx, actor, orgId } = scope;
  const days = opts.days ?? 14;

  const rosterCounts: Record<string, number> = {};
  if (opts.teamIds.length > 0) {
    const rows = await tx
      .select({ teamId: teamMemberships.teamId, n: count() })
      .from(teamMemberships)
      .where(inArray(teamMemberships.teamId, opts.teamIds))
      .groupBy(teamMemberships.teamId);
    for (const r of rows) rosterCounts[r.teamId] = r.n;
  }

  let management: OrgOverview['management'] = null;
  if (can(actor, 'write', 'members')) {
    const roleRows = await tx.select({ role: memberships.role, n: count() }).from(memberships).groupBy(memberships.role);
    const [pending] = await tx
      .select({ n: count() })
      .from(invites)
      .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gte(invites.expiresAt, new Date())));
    management = {
      memberCount: roleRows.reduce((a, r) => a + r.n, 0),
      pendingInvites: pending?.n ?? 0,
      roleCounts: roleRows.map((r) => ({ role: r.role, count: r.n })).sort((a, b) => b.count - a.count),
    };
  }

  let activity: OrgOverview['activity'] = null;
  if (can(actor, 'read', 'audit_log')) {
    const labels = lastDays(days, opts.timeZone);
    const since = new Date(Date.now() - (days + 1) * 86_400_000);
    // Managers never see owner-only entries, in counts either.
    const visible = actor.orgRole === 'owner' ? undefined : eq(auditLog.ownerAction, false);
    const dayExpr = sql<string>`to_char((${auditLog.createdAt} at time zone ${opts.timeZone})::date, 'YYYY-MM-DD')`;
    const rows = await tx
      .select({ day: dayExpr, n: count() })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), gte(auditLog.createdAt, since), visible))
      .groupBy(sql`1`); // by position: the bound timezone parameter would otherwise appear as two distinct expressions
    const byDay = new Map(rows.map((r) => [r.day, r.n]));
    const series = labels.map((day) => ({ day, count: byDay.get(day) ?? 0 }));

    const recent = await tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorUserId: auditLog.actorUserId,
        createdAt: auditLog.createdAt,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), visible))
      .orderBy(sql`${auditLog.createdAt} desc`)
      .limit(6);
    const ids = [...new Set(recent.map((r) => r.actorUserId).filter((x): x is string => Boolean(x)))];
    const names = new Map(
      (ids.length ? await tx.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : []).map(
        (u) => [u.id, u.name ?? u.email],
      ),
    );
    activity = {
      days: series,
      total: series.reduce((a, d) => a + d.count, 0),
      recent: recent.map((r) => ({
        id: r.id,
        action: r.action,
        actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
        createdAt: r.createdAt,
        metadata: r.metadata,
      })),
    };
  }

  return { rosterCounts, management, activity };
}
