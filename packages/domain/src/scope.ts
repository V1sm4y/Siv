import { memberships, setTenant, teamMemberships, type Db, type Tx } from '@arena/db';
import type { Actor, OrgRole, TeamRole } from '@arena/authz';
import { and, eq } from 'drizzle-orm';
import { NotFoundError } from './errors';

export interface OrgScope {
  tx: Tx;
  orgId: string;
  actor: Actor;
  membershipId: string;
}

/**
 * The only supported way to touch tenant data. Resolves the caller's membership FIRST with only the
 * user context (RLS lets a user see their own memberships), then switches the transaction to the org
 * context. A non-member gets 404, never 403, so org existence does not leak.
 */
export async function withOrgActor<T>(
  db: Db,
  p: { userId: string; orgId: string; teamId?: string },
  fn: (scope: OrgScope) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId: p.userId, orgId: '', inviteTokenHash: '', guardianTokenHash: '' });
    const [m] = await tx
      .select({ id: memberships.id, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, p.orgId), eq(memberships.userId, p.userId)))
      .limit(1);
    if (!m) throw new NotFoundError('Organisation');

    await setTenant(tx, { orgId: p.orgId });
    let teamRole: TeamRole | null = null;
    if (p.teamId) {
      const [tm] = await tx
        .select({ role: teamMemberships.role })
        .from(teamMemberships)
        .where(and(eq(teamMemberships.teamId, p.teamId), eq(teamMemberships.userId, p.userId)))
        .limit(1);
      teamRole = (tm?.role as TeamRole | undefined) ?? null;
    }
    const actor: Actor = { userId: p.userId, orgRole: m.role as OrgRole, teamRole };
    return fn({ tx, orgId: p.orgId, actor, membershipId: m.id });
  });
}
