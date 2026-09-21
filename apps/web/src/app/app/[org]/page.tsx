import { getOrgOverview, withOrgActor } from '@arena/domain';
import { BarList, ContainersArt, EmptyState, GameIcon, Sparkline } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { ChevronRight } from 'lucide-react';
import { GameLink } from '@/components/shell/game-link';
import { PageHeader, Section, SignalStrip } from '@/components/page-header';
import { Stat } from '@/components/stat';
import { actionLabel, dayLabel, roleLabel, shortTime } from '@/lib/format';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';
import { NewTeamButton } from './new-team-button';

export const metadata = { title: 'Overview' };

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await loadOrgContext(slug);
  const base = `/app/${ctx.org.slug}`;
  const overview = await withOrgActor(getDb(), { userId: ctx.user.id, orgId: ctx.org.id }, (scope) =>
    getOrgOverview(scope, { teamIds: ctx.teams.map((t) => t.id), timeZone: ctx.user.timezone }),
  );
  const { management, activity } = overview;

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title={ctx.org.name}
        description="Your game containers and what has been happening across them."
        actions={ctx.canCreateTeams && ctx.teams.length > 0 ? <NewTeamButton variant="secondary" /> : undefined}
      />

      <SignalStrip>
        <Stat label="Game containers" value={ctx.teams.length} />
        {management ? <Stat label="Members" value={management.memberCount} /> : <Stat label="Your teams" value={ctx.teams.length} />}
        {management && <Stat label="Pending invites" value={management.pendingInvites} />}
        {activity && (
          <Stat label="Activity · 14 days">
            <span className="flex flex-col gap-2">
              <span className="title text-6xl">{activity.total}</span>
              <Sparkline
                title="Organisation activity per day"
                unit="events"
                width={168}
                height={40}
                points={activity.days.map((d) => ({ label: dayLabel(d.day), value: d.count }))}
              />
            </span>
          </Stat>
        )}
      </SignalStrip>

      <Section label="Game containers" hint="One per game. Each has its own roster, calendar and theme.">
        {ctx.teams.length === 0 ? (
          <EmptyState
            art={<ContainersArt />}
            title={ctx.canCreateTeams ? 'Create your first game container' : 'You haven’t been added to a team yet'}
            description={
              ctx.canCreateTeams
                ? 'A container holds one game’s roster, schedule and analysis. Add one per game you compete in.'
                : 'Ask a manager in your organisation to add you to a team.'
            }
            action={ctx.canCreateTeams ? <NewTeamButton /> : undefined}
          />
        ) : (
          <ul className="-mt-2 divide-y divide-line">
            {ctx.teams.map((t) => {
              const g = getGame(t.gameId);
              const roster = overview.rosterCounts[t.id] ?? 0;
              return (
                <li key={t.id} data-game={t.gameId}>
                  <GameLink href={`${base}/t/${t.slug}`} gameId={t.gameId} data-testid={`team-${t.slug}`} className="group -mx-3 flex items-center gap-5 rounded-sm px-3 py-5 transition-colors hover:bg-surface-2/60">
                    <span className="grid size-12 shrink-0 place-items-center rounded-sm bg-accent text-accent-fg">{g && <GameIcon icon={g.theme.icon} className="size-6" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="title block truncate text-3xl">{t.name}</span>
                      <span className="mt-1 block truncate text-sm text-fg-muted">
                        {g?.name ?? t.gameId}
                        {t.edition ? ` · ${g?.editions?.find((e) => e.id === t.edition)?.label ?? t.edition}` : ''}
                      </span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="title block text-3xl">{roster}</span>
                      <span className="eyebrow">on roster</span>
                    </span>
                    <ChevronRight className="size-5 text-fg-subtle transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </GameLink>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {management && (
        <Section label="Who’s here" hint="Members by organisation role.">
          <BarList items={management.roleCounts.map((r) => ({ label: roleLabel(r.role), value: r.count }))} unit="people" className="max-w-xl" />
        </Section>
      )}

      {activity && (
        <Section label="Recent activity" hint="From the audit log. Most recent first.">
          {activity.recent.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="relative -mt-1 flex flex-col">
              {activity.recent.map((e) => (
                <li key={e.id} className="relative grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-line py-3 text-sm last:border-b-0">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 rounded-full bg-accent" />
                  <span><span className="text-fg">{e.actorName ?? 'System'}</span> <span className="text-fg-muted">{actionLabel(e.action).toLowerCase()}</span></span>
                  <time className="text-xs text-fg-subtle tabular" dateTime={e.createdAt.toISOString()}>{shortTime(e.createdAt, ctx.user.timezone)}</time>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </>
  );
}
