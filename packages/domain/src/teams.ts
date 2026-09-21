import { teamMemberships, teams, users } from '@arena/db';
import { assertCan, can } from '@arena/authz';
import { requireGame } from '@arena/game-registry';
import type { CreateTeamInput } from '@arena/schemas';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { appendAudit } from './audit';
import { ConflictError, ValidationError } from './errors';
import type { RequestMeta } from './orgs';
import type { OrgScope } from './scope';
import { slugify, withSuffix } from './slug';

export async function createTeam(scope: OrgScope, input: CreateTeamInput, meta: RequestMeta = {}) {
  const { tx, actor, orgId } = scope;
  assertCan(actor, 'write', 'org_settings');

  let game;
  try {
    game = requireGame(input.gameId);
  } catch {
    throw new ValidationError(`Unknown game: ${input.gameId}`);
  }
  if (input.edition && !game.editions?.some((e) => e.id === input.edition)) {
    throw new ValidationError(`Unknown edition "${input.edition}" for ${game.name}`);
  }
  const edition = input.edition ?? game.editions?.find((e) => e.current)?.id ?? null;

  const base = slugify(input.name);
  let team: typeof teams.$inferSelect | undefined;
  for (let attempt = 0; attempt < 6 && !team; attempt++) {
    [team] = await tx
      .insert(teams)
      .values({ orgId, gameId: input.gameId, edition, name: input.name, slug: withSuffix(base, attempt) })
      .onConflictDoNothing()
      .returning();
  }
  if (!team) throw new ConflictError('Could not allocate a unique team URL');

  await appendAudit(tx, {
    orgId,
    actorUserId: actor.userId,
    action: 'team.create',
    resourceType: 'team',
    resourceId: team.id,
    metadata: { gameId: input.gameId, name: input.name },
    ...meta,
  });
  return team;
}

/** Owners/managers see every team. Others see only teams they belong to. Guests see none (until shared). */
export async function listTeams(scope: OrgScope) {
  const { tx, actor } = scope;
  const live = isNull(teams.deletedAt);
  if (actor.orgRole === 'owner' || actor.orgRole === 'manager') {
    return tx.select().from(teams).where(live).orderBy(asc(teams.createdAt));
  }
  if (actor.orgRole === 'guest') return [];
  const mine = await tx
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, actor.userId));
  if (mine.length === 0) return [];
  return tx
    .select()
    .from(teams)
    .where(and(live, inArray(teams.id, mine.map((m) => m.teamId))))
    .orderBy(asc(teams.createdAt));
}

export async function getTeamBySlug(scope: OrgScope, slug: string) {
  const all = await listTeams(scope);
  return all.find((t) => t.slug === slug) ?? null;
}

/** Members of one team. Public roster fields only; emails are limited to those who manage members. */
export async function listTeamRoster(scope: OrgScope, teamId: string) {
  const { tx, actor } = scope;
  assertCan(actor, 'read', 'roster');
  const showEmail = can(actor, 'write', 'members');
  const rows = await tx
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: teamMemberships.role,
      gameRoleId: teamMemberships.gameRoleId,
    })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.teamId, teamId))
    .orderBy(asc(teamMemberships.createdAt));
  return rows.map((r) => ({ ...r, email: showEmail ? r.email : null }));
}
