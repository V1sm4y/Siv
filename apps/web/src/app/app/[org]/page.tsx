import { EmptyState } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { ChevronRight, Users } from 'lucide-react';
import { GameIcon } from '@arena/ui';
import { GameLink } from '@/components/shell/game-link';
import { PageHeader } from '@/components/page-header';
import { Stat } from '@/components/stat';
import { loadOrgContext } from '@/server/shell';
import { NewTeamButton } from './new-team-button';

export const metadata = { title: 'Overview' };

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await loadOrgContext(slug);
  const base = `/app/${ctx.org.slug}`;
  return (
    <>
      <PageHeader
        title={ctx.org.name}
        description="Your game containers. Each has its own roster, calendar and theme."
        actions={ctx.canCreateTeams && ctx.teams.length > 0 ? <NewTeamButton orgId={ctx.org.id} orgSlug={ctx.org.slug} variant="secondary" /> : undefined}
      />

      <dl className="mb-10 flex flex-wrap gap-x-12 gap-y-4">
        <Stat label="Game containers" value={ctx.teams.length} />
        {ctx.memberCount !== null && <Stat label="Members" value={ctx.memberCount} />}
      </dl>

      <section aria-labelledby="teams-h">
        <h2 id="teams-h" className="mb-3 text-sm font-medium text-fg-muted">Teams</h2>
        {ctx.teams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong">
            <EmptyState
              icon={<Users className="size-5" />}
              title={ctx.canCreateTeams ? 'Create your first game container' : 'You haven’t been added to a team yet'}
              description={
                ctx.canCreateTeams
                  ? 'A container holds one game’s roster, schedule and analysis. Add one per game you compete in.'
                  : 'Ask a manager in your organisation to add you to a team.'
              }
              action={ctx.canCreateTeams ? <NewTeamButton orgId={ctx.org.id} orgSlug={ctx.org.slug} /> : undefined}
            />
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
            {ctx.teams.map((t) => {
              const g = getGame(t.gameId);
              return (
                <li key={t.id} data-game={t.gameId}>
                  <GameLink
                    href={`${base}/t/${t.slug}`}
                    gameId={t.gameId}
                    data-testid={`team-${t.slug}`}
                    className="group flex items-center gap-4 p-4 transition-colors hover:bg-surface-2"
                  >
                    <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-fg">{g && <GameIcon icon={g.theme.icon} className="size-5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block truncate text-sm text-fg-muted">
                        {g?.name ?? t.gameId}
                        {t.edition ? ` · ${g?.editions?.find((e) => e.id === t.edition)?.label ?? t.edition}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </GameLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
