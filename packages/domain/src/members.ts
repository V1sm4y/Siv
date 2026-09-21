import { memberships, users } from '@arena/db';
import { assertCan, can, ForbiddenError, type OrgRole } from '@arena/authz';
import { asc, eq, sql } from 'drizzle-orm';
import { appendAudit } from './audit';
import { ConflictError, NotFoundError } from './errors';
import type { RequestMeta } from './orgs';
import type { OrgScope } from './scope';

export interface RoleChangeCheck {
  actorRole: OrgRole;
  targetRole: OrgRole;
  newRole: OrgRole;
  ownerCount: number;
  actingOnSelf: boolean;
}

/** Pure policy for role changes. Returns a reason string when denied. */
export function roleChangeDenial(c: RoleChangeCheck): string | null {
  if (c.actorRole !== 'owner' && c.actorRole !== 'manager') return 'Only owners and managers change roles';
  if (c.targetRole === 'owner' && c.actorRole !== 'owner') return 'Only an owner can change an owner';
  if (c.newRole === 'owner' && c.actorRole !== 'owner') return 'Only an owner can grant ownership';
  if (c.actorRole === 'manager' && (c.newRole === 'manager' || c.targetRole === 'manager')) {
    return 'Only an owner can change manager roles';
  }
  if (c.targetRole === 'owner' && c.newRole !== 'owner' && c.ownerCount <= 1) {
    return 'An organisation must keep at least one owner';
  }
  return null;
}

export async function listMembers(scope: OrgScope) {
  const { tx, actor } = scope;
  assertCan(actor, 'read', 'roster');
  const showEmail = can(actor, 'write', 'members');
  const rows = await tx
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .orderBy(asc(memberships.createdAt));
  return rows.map((r) => ({ ...r, email: showEmail ? r.email : null }));
}

export async function changeMemberRole(
  scope: OrgScope,
  membershipId: string,
  newRole: OrgRole,
  meta: RequestMeta = {},
) {
  const { tx, actor, orgId } = scope;
  assertCan(actor, 'write', 'members');
  const [target] = await tx.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!target) throw new NotFoundError('Member');

  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.role, 'owner'));

  const denial = roleChangeDenial({
    actorRole: actor.orgRole,
    targetRole: target.role as OrgRole,
    newRole,
    ownerCount: n,
    actingOnSelf: target.userId === actor.userId,
  });
  if (denial) {
    if (denial.includes('at least one owner')) throw new ConflictError(denial);
    throw Object.assign(new ForbiddenError('write', 'members'), { message: denial });
  }
  if (target.role === newRole) return target;

  const [updated] = await tx
    .update(memberships)
    .set({ role: newRole })
    .where(eq(memberships.id, membershipId))
    .returning();
  await appendAudit(tx, {
    orgId,
    actorUserId: actor.userId,
    action: 'member.role_change',
    resourceType: 'membership',
    resourceId: membershipId,
    // Ownership changes are owner-only knowledge.
    ownerAction: target.role === 'owner' || newRole === 'owner',
    metadata: { from: target.role, to: newRole, userId: target.userId },
    ...meta,
  });
  return updated!;
}
