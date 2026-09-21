import { invites, memberships, setTenant, teamMemberships, teams, users, type Db } from '@arena/db';
import { assertCan, type OrgRole } from '@arena/authz';
import type { InviteInput } from '@arena/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { appendAudit } from './audit';
import { randomToken, sha256Hex } from './crypto';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import type { RequestMeta } from './orgs';
import type { OrgScope } from './scope';
import { ForbiddenError } from '@arena/authz';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Owners can invite managers; managers can only invite members and guests. Nobody invites owners. */
export function canInviteRole(actorRole: OrgRole, role: 'manager' | 'member' | 'guest'): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'manager') return role !== 'manager';
  return false;
}

export async function createInvite(scope: OrgScope, input: InviteInput, meta: RequestMeta = {}) {
  const { tx, actor, orgId } = scope;
  assertCan(actor, 'write', 'members');
  if (!canInviteRole(actor.orgRole, input.orgRole)) throw new ForbiddenError('write', 'members');

  if (input.teamId) {
    const [t] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, input.teamId)).limit(1);
    if (!t) throw new ValidationError('Team not found in this organisation');
  }

  const token = randomToken();
  const [invite] = await tx
    .insert(invites)
    .values({
      orgId,
      email: input.email,
      orgRole: input.orgRole,
      teamId: input.teamId ?? null,
      teamRole: input.teamRole ?? null,
      tokenHash: sha256Hex(token),
      invitedBy: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();
  if (!invite) throw new Error('invite insert returned no row');

  await appendAudit(tx, {
    orgId,
    actorUserId: actor.userId,
    action: 'invite.create',
    resourceType: 'invite',
    resourceId: invite.id,
    metadata: { email: input.email, orgRole: input.orgRole, teamRole: input.teamRole ?? null },
    ...meta,
  });
  // The raw token leaves the server only in the email; only its hash is stored.
  return { invite, token };
}

export async function listPendingInvites(scope: OrgScope) {
  assertCan(scope.actor, 'write', 'members');
  return scope.tx
    .select()
    .from(invites)
    .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt)))
    .orderBy(desc(invites.createdAt));
}

export async function acceptInvite(db: Db, p: { token: string; userId: string } & RequestMeta) {
  const tokenHash = sha256Hex(p.token);
  return db.transaction(async (tx) => {
    await setTenant(tx, { userId: p.userId, orgId: '', inviteTokenHash: tokenHash, guardianTokenHash: '' });
    const [invite] = await tx.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
    if (!invite || invite.revokedAt) throw new NotFoundError('Invite');
    if (invite.acceptedAt) throw new ConflictError('This invite has already been used');
    if (invite.expiresAt.getTime() < Date.now()) throw new ConflictError('This invite has expired');

    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, p.userId)).limit(1);
    if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      // Same message as not-found: do not confirm to a stranger that the token is real.
      throw new NotFoundError('Invite');
    }

    await setTenant(tx, { orgId: invite.orgId });
    const [existing] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, p.userId)))
      .limit(1);
    if (!existing) {
      await tx.insert(memberships).values({ orgId: invite.orgId, userId: p.userId, role: invite.orgRole });
    }
    if (invite.teamId && invite.teamRole) {
      await tx
        .insert(teamMemberships)
        .values({ orgId: invite.orgId, teamId: invite.teamId, userId: p.userId, role: invite.teamRole })
        .onConflictDoNothing();
    }
    await tx.update(invites).set({ acceptedAt: new Date(), acceptedBy: p.userId }).where(eq(invites.id, invite.id));
    await appendAudit(tx, {
      orgId: invite.orgId,
      actorUserId: p.userId,
      action: 'invite.accept',
      resourceType: 'invite',
      resourceId: invite.id,
      metadata: { orgRole: invite.orgRole, teamRole: invite.teamRole },
      ip: p.ip,
      userAgent: p.userAgent,
    });
    return { orgId: invite.orgId };
  });
}
