import 'server-only';
import { can, type OrgRole } from '@arena/authz';
import { countMembers, guardianStatusFor, listOrgsForUser, listTeams, withOrgActor } from '@arena/domain';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDb } from './db';
import { requireOnboardedUser } from './session';

export interface TeamSummary {
  id: string;
  slug: string;
  name: string;
  gameId: string;
  edition: string | null;
}

/** Deduplicated per request: the layout and the page both call this. */
export const loadOrgContext = cache(async (orgSlug: string) => {
  const user = await requireOnboardedUser();
  const db = getDb();
  const orgs = await listOrgsForUser(db, user.id);
  const org = orgs.find((o) => o.slug === orgSlug);
  if (!org) notFound(); // non-members get 404, never a hint the org exists

  const [guardian, scoped] = await Promise.all([
    guardianStatusFor(db, user.id),
    withOrgActor(db, { userId: user.id, orgId: org.id }, async (scope) => {
      const teams: TeamSummary[] = (await listTeams(scope)).map((t) => ({
        id: t.id, slug: t.slug, name: t.name, gameId: t.gameId, edition: t.edition,
      }));
      const canManage = can(scope.actor, 'write', 'members');
      const canCreateTeams = can(scope.actor, 'write', 'org_settings');
      const canReadAudit = can(scope.actor, 'read', 'audit_log');
      return { teams, canManage, canCreateTeams, canReadAudit, memberCount: canManage ? await countMembers(scope) : null };
    }),
  ]);

  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image, timezone: user.timezone },
    org: { id: org.id, name: org.name, slug: org.slug, isDemo: org.isDemo },
    role: org.role as OrgRole,
    guardian,
    ...scoped,
  };
});

export type OrgContext = Awaited<ReturnType<typeof loadOrgContext>>;
