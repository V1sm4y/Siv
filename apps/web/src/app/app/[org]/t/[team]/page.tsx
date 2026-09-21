import { Badge, EmptyState, GameIcon } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { listTeamRoster, withOrgActor } from '@arena/domain';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AmbientGradient } from '@/components/effects/ambient-gradient';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';
import { Avatar } from '@arena/ui';

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

  return (
    <div data-testid="team-home" data-game-id={game.id}>
      <section className="surface-textured relative mb-10 overflow-hidden rounded-xl border border-line px-6 py-10 sm:px-10 sm:py-14">
        {/* CSS-only: this page carries data, and the shader cost ~2s TBT under Lighthouse (D-41). */}
        <AmbientGradient colors={game.theme.gradient} webgl={false} />
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="accent"><GameIcon icon={game.theme.icon} className="size-3.5" /> {game.name}</Badge>
            {edition && <Badge>{edition.label}</Badge>}
            {game.depth === 'foundation' && <Badge>Foundation module</Badge>}
          </div>
          <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl" data-testid="team-title">{team.name}</h1>
          <p className="mt-3 max-w-xl text-fg-muted text-pretty">
            Analytics, scouting, tactical boards and scheduling for this container are not built yet. Roster and access work today.
          </p>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="roster-h">
          <h2 id="roster-h" className="mb-3 text-sm font-medium text-fg-muted">Roster</h2>
          {roster.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong">
              <EmptyState
                icon={<UserPlus className="size-5" />}
                title="No one is on this team yet"
                description={ctx.canManage ? 'Invite players and staff and assign them to this team.' : 'A manager will add players and staff.'}
                action={ctx.canManage ? <Link className="text-sm text-accent-text underline underline-offset-4" href={`/app/${ctx.org.slug}/members`}>Go to members</Link> : undefined}
              />
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
              {roster.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 p-3">
                  <Avatar name={m.name ?? m.email} src={m.image} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name ?? 'Unnamed'}</span>
                    {m.email && <span className="block truncate text-xs text-fg-muted">{m.email}</span>}
                  </span>
                  {m.gameRoleId && <Badge>{game.roles.find((r) => r.id === m.gameRoleId)?.label ?? m.gameRoleId}</Badge>}
                  <Badge tone="accent" className="capitalize">{m.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="sources-h">
            <h2 id="sources-h" className="mb-3 text-sm font-medium text-fg-muted">Data sources</h2>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface-1">
              {game.adapters.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {a.label}
                    {a.requiresCredentials && <span className="block text-xs text-fg-subtle">Needs player consent / credentials</span>}
                  </span>
                  <Badge tone={STATUS[a.status]?.tone}>{STATUS[a.status]?.label}</Badge>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="roles-h">
            <h2 id="roles-h" className="mb-3 text-sm font-medium text-fg-muted">Roles in {game.name}</h2>
            <ul className="flex flex-wrap gap-2">{game.roles.map((r) => <li key={r.id}><Badge>{r.label}</Badge></li>)}</ul>
          </section>
          {game.arenas.length > 1 && (
            <section aria-labelledby="maps-h">
              <h2 id="maps-h" className="mb-3 text-sm font-medium text-fg-muted">Map pool</h2>
              <ul className="flex flex-wrap gap-2">{game.arenas.map((a) => <li key={a.id}><Badge>{a.label}</Badge></li>)}</ul>
              <p className="mt-2 text-xs text-fg-subtle">Map pools rotate; confirm against the current competitive pool.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
