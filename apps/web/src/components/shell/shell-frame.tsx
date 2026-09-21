'use client';
import { ConnectionBanner, Dialog, DialogContent, Tooltip, brandTheme } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { Menu } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Wordmark } from '../wordmark';
import { CreateTeamDialog } from './create-team-dialog';
import { GameBackdrop } from './game-backdrop';
import { GameTransitionProvider } from './game-transition';
import { IntroSequence } from './intro';
import { Palette } from './palette';
import { ShellActionsContext } from './shell-actions';
import { SidebarContent } from './sidebar';
import { SoundToggle } from './sound-toggle';
import type { ShellData } from './types';

export function ShellFrame({ data, children }: { data: ShellData; children: ReactNode }) {
  return (
    <GameTransitionProvider>
      <Frame data={data}>{children}</Frame>
    </GameTransitionProvider>
  );
}

function Frame({ data, children }: { data: ShellData; children: ReactNode }) {
  const params = useParams<{ team?: string }>();
  const current = data.teams.find((t) => t.slug === params.team);
  const game = current ? getGame(current.gameId) : undefined;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const actions = useMemo(() => ({ openCreateTeam: () => setCreating(true) }), []);
  // Changing text in a polite live region is announced by screen readers on every route change.
  const announce = current ? `Viewing ${current.name}` : 'Viewing organisation overview';

  return (
    <ShellActionsContext.Provider value={actions}>
      {/* data-game drives the per-game accent; the registered @property makes the change animate. */}
      <div data-game={game?.id} className="relative isolate min-h-dvh md:grid md:grid-cols-[272px_1fr]">
        <GameBackdrop gameId={game?.id} />

        <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface-1/60 backdrop-blur-sm md:block" aria-label="Sidebar">
          <SidebarContent data={data} current={current} instance="desktop" />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface-0/70 px-4 backdrop-blur-md sm:px-8">
            <div className="md:hidden">
              <Tooltip label="Menu">
                <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
                  <Menu className="size-5" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <Wordmark className="md:hidden" />
            <p className="eyebrow hidden truncate md:block" aria-hidden="true">
              {data.org.name} <span className="mx-1.5 text-line-strong">/</span> <span className="text-fg-muted">{current?.name ?? 'Overview'}</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Palette data={data} />
              <SoundToggle />
            </div>
          </header>

          <ConnectionBanner />
          {data.guardian.minor && !data.guardian.verified && (
            <p role="status" className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning sm:px-8">
              {data.guardian.pending
                ? 'Waiting for your parent or guardian to consent. Wellness, public profile and voice recording stay off until then.'
                : 'A parent or guardian must consent before wellness, public profile and voice recording can be used.'}
            </p>
          )}

          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-10 outline-none sm:px-10 sm:py-12">
            {children}
          </main>
          <div role="status" aria-live="polite" className="sr-only">{announce}</div>
        </div>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent title="Menu" hideTitle className="top-0 left-0 h-dvh max-w-xs translate-x-0 translate-y-0 rounded-none p-0">
            <div className="-mt-4 h-full">
              <SidebarContent data={data} current={current} instance="mobile" onNavigate={() => setMobileOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>

        {data.canCreateTeams && <CreateTeamDialog orgId={data.org.id} orgSlug={data.org.slug} open={creating} onOpenChange={setCreating} />}
        <IntroSequence tint={game?.theme.accent ?? brandTheme.accent} label={data.org.name} />
      </div>
    </ShellActionsContext.Provider>
  );
}
