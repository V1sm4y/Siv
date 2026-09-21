'use client';
import { ConnectionBanner, Dialog, DialogContent, Tooltip } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { Menu } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Wordmark } from '../wordmark';
import { GameTransitionProvider } from './game-transition';
import { Palette } from './palette';
import { SidebarContent } from './sidebar';
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
  const gameId = current ? getGame(current.gameId)?.id : undefined;
  const [mobileOpen, setMobileOpen] = useState(false);
  // Changing text in a polite live region is announced by screen readers on every route change.
  const announce = current ? `Viewing ${current.name}` : 'Viewing organisation overview';

  return (
    // data-game drives the per-game accent; the registered @property makes the change animate.
    <div data-game={gameId} className="min-h-dvh md:grid md:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface-1 md:block" aria-label="Sidebar">
        <SidebarContent data={data} current={current} instance="desktop" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface-0/85 px-4 backdrop-blur-sm">
          <div className="md:hidden">
            <Tooltip label="Menu">
              <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <Wordmark className="md:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <Palette data={data} />
          </div>
        </header>

        <ConnectionBanner />
        {data.guardian.minor && !data.guardian.verified && (
          <p role="status" className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
            {data.guardian.pending
              ? 'Waiting for your parent or guardian to consent. Wellness, public profile and voice recording stay off until then.'
              : 'A parent or guardian must consent before wellness, public profile and voice recording can be used.'}
          </p>
        )}

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8">
          {children}
        </main>
        <div role="status" aria-live="polite" className="sr-only">{announce}</div>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          title="Menu"
          hideTitle
          className="top-0 left-0 h-dvh max-w-xs translate-x-0 translate-y-0 rounded-none p-0"
        >
          <div className="-mt-4 h-full">
            <SidebarContent data={data} current={current} instance="mobile" onNavigate={() => setMobileOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
