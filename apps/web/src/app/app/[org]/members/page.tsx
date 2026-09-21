import type { OrgRole } from '@arena/authz';
import { listMembers, listPendingInvites, roleChangeDenial, withOrgActor } from '@arena/domain';
import { ErrorState } from '@arena/ui';
import { PageHeader } from '@/components/page-header';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';
import { MembersClient } from './members-client';

export const metadata = { title: 'Members' };
const ROLES: OrgRole[] = ['owner', 'manager', 'member', 'guest'];

export default async function MembersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const ctx = await loadOrgContext(slug);
  if (!ctx.canManage) {
    return <ErrorState title="You don’t have access to member management" description="Only owners and managers can manage members and invitations." />;
  }
  const { members, invites } = await withOrgActor(getDb(), { userId: ctx.user.id, orgId: ctx.org.id }, async (scope) => ({
    members: await listMembers(scope),
    invites: await listPendingInvites(scope),
  }));
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  return (
    <>
      <PageHeader eyebrow="Organisation" title="Members" description="Everyone in the organisation, and pending invitations." />
      <MembersClient
        initialInviteOpen={sp.invite === '1'}
        orgId={ctx.org.id}
        canInviteManager={ctx.role === 'owner'}
        teams={ctx.teams.map((t) => ({ id: t.id, name: t.name, gameId: t.gameId }))}
        members={members.map((m) => ({
          membershipId: m.membershipId,
          name: m.name,
          email: m.email,
          role: m.role as OrgRole,
          isSelf: m.userId === ctx.user.id,
          // Computed server-side with the same policy the API enforces; the API is still the authority.
          allowedRoles: ROLES.filter(
            (r) => r === m.role || roleChangeDenial({ actorRole: ctx.role, targetRole: m.role as OrgRole, newRole: r, ownerCount, actingOnSelf: m.userId === ctx.user.id }) === null,
          ),
        }))}
        invites={invites.map((i) => ({ id: i.id, email: i.email, orgRole: i.orgRole, teamRole: i.teamRole, expiresAt: i.expiresAt.toISOString() }))}
      />
    </>
  );
}
