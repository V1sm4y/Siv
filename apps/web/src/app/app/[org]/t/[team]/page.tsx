import { listTeamRoster, withOrgActor } from '@arena/domain';
import { Avatar, Badge, EmptyState, GameIcon, RoleCoverage, RosterArt } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TeamHero } from './hero';
import { Section, SignalStrip } from '@/components/page-header';
import { Stat } from '@/components/stat';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' }> = {
  available: { label: 'Available', tone: 'success' },
  planned: { label: 'Not built yet', tone: 'neutral' },
};

export async function generateMetadata({ params }: { params: Promise<{ org: string; team: string }> }) {
  const { org, team } = await params;
  const ctx = await loadOrgContext(org);
  return { title: ctx.teams.find((t) => t.slug === team)?.name ?? 'Team' };
}

export default async function TeamHome({ params }: { params: Promise<{ org: string; team: string }> }) {
  const { org: slug, team: teamSlug } = await params;
  const ctx = await loadOrgContext(slug);
  const team = ctx.teams.find((t) => t.slug === teamSlug);
  if (!team) notFound();
  const game = getGame(team.gameId);
  if (!game) notFound();

  const roster = await withOrgActor(getDb(), { userId: ctx.user.id, orgId: ctx.org.id, teamId: team.id }, (s) => listTeamRoster(s, team.id));
  const edition = game.editions?.find((e) => e.id === team.edition);
  const coverage = game.roles.map((r) => ({ id: r.id, label: r.label, holders: roster.filter((m) => m.gameRoleId === r.id).length }));
  const covered = coverage.filter((c) => c.holders > 0).length;
  const live = game.adapters.filter((a) => a.status === 'available').length;

  return (
    <div data-testid="team-home" data-game-id={game.id}>
      <TeamHero
        title={team.name}
        eyebrow={`${game.name}${edition ? ` · ${edition.label}` : ''}`}
        note="Analytics, scouting, tactical boards and scheduling for this container are not built yet. Roster and access work today."
        icon={<GameIcon icon={game.theme.icon} className="size-full" />}
        badges={[game.depth === 'foundation' ? 'Foundation module' : 'Full module']}
      />

      <SignalStrip>
        <Stat label="On roster" value={roster.length} suffix={`of ${game.teamSize}`} />
        <Stat label="Roles covered" value={covered} suffix={`of ${game.roles.length}`} />
        <Stat label="Data sources live" value={live} suffix={`of ${game.adapters.length}`} />
        <Stat label="Map pool" value={game.arenas.length} suffix={game.arenas.length === 1 ? 'arena' : 'arenas'} />
      </SignalStrip>

      <Section label="Roster" hint="Everyone assigned to this container.">
        {roster.length === 0 ? (
          <EmptyState
            art={<RosterArt />}
            title="No one is on this team yet"
            description={ctx.canManage ? 'Invite players and staff and assign them to this team.' : 'A manager will add players and staff.'}
            action={ctx.canManage ? <Link className="text-sm text-accent-text underline underline-offset-4" href={`/app/${ctx.org.slug}/members?invite=1`}>Invite someone</Link> : undefined}
          />
        ) : (
          <ul className="-mt-2 divide-y divide-line">
            {roster.map((m) => (
              <li key={m.userId} className="flex items-center gap-4 py-4">
                <Avatar name={m.name ?? m.email} src={m.image} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name ?? 'Unnamed'}</span>
                  {m.email && <span className="block truncate text-xs text-fg-muted">{m.email}</span>}
                </span>
                {m.gameRoleId && <Badge>{game.roles.find((r) => r.id === m.gameRoleId)?.label ?? m.gameRoleId}</Badge>}
                <Badge tone="accent" className="capitalize">{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Role coverage" hint="In-game roles someone on this roster plays.">
        <RoleCoverage roles={coverage} />
        {roster.length === 0 && <p className="mt-3 text-sm text-fg-subtle">Nothing to cover yet: this fills in as players are assigned in-game roles.</p>}
      </Section>

      <Section label="Data sources" hint="Where this container’s stats can come from.">
        <ul className="-mt-2 divide-y divide-line">
          {game.adapters.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>
                {a.label}
                {a.requiresCredentials && <span className="block text-xs text-fg-subtle">Needs player consent / credentials</span>}
              </span>
              <Badge tone={STATUS[a.status]?.tone}>{STATUS[a.status]?.label}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      {game.arenas.length > 1 && (
        <Section label="Map pool" hint="Pools rotate; confirm against the current competitive pool.">
          <ul className="flex flex-wrap gap-2">{game.arenas.map((a) => <li key={a.id}><Badge>{a.label}</Badge></li>)}</ul>
        </Section>
      )}
    </div>
  );
}
