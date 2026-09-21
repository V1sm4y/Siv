'use client';
import { GameIcon, Popover, PopoverContent, PopoverTrigger, cn } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react';
import { useState } from 'react';
import { GameLink } from './game-link';
import { useShellActions } from './shell-actions';
import type { ShellData, ShellTeam } from './types';

export function GameSwitcher({ data, current }: { data: ShellData; current: ShellTeam | undefined }) {
  const [open, setOpen] = useState(false);
  const { openCreateTeam } = useShellActions();
  const game = current ? getGame(current.gameId) : null;
  const base = `/app/${data.org.slug}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch game container. Current: ${current?.name ?? 'Overview'}`}
          data-testid="game-switcher"
          className="group relative flex w-full items-center gap-3 overflow-hidden rounded-md border border-line-strong bg-surface-2/60 py-2.5 pr-3 pl-4 text-left transition-colors hover:bg-surface-3"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
          <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-accent text-accent-fg">
            {game ? <GameIcon icon={game.theme.icon} className="size-5" /> : <LayoutGrid className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{current?.name ?? 'Overview'}</span>
            <span className="eyebrow block truncate normal-case tracking-wide">
              {game ? `${game.shortName}${current?.edition ? ` · ${game.editions?.find((e) => e.id === current.edition)?.label ?? ''}` : ''}` : 'All teams'}
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-fg-subtle" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64">
        <p className="eyebrow px-2 py-1.5">Containers</p>
        <ul role="list" className="flex flex-col">
          <li>
            <GameLink href={base} gameId={null} onNavigate={() => setOpen(false)} className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg">
              <LayoutGrid className="size-4" aria-hidden="true" /> Overview
              {!current && <Check className="ml-auto size-4" aria-label="Current" />}
            </GameLink>
          </li>
          {data.teams.map((t) => {
            const g = getGame(t.gameId);
            const active = current?.id === t.id;
            return (
              <li key={t.id} data-game={t.gameId}>
                <GameLink
                  href={`${base}/t/${t.slug}`}
                  gameId={t.gameId}
                  onNavigate={() => setOpen(false)}
                  data-testid={`switch-${t.slug}`}
                  className={cn('flex items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-surface-3', active && 'bg-surface-2')}
                >
                  <span className="grid size-6 place-items-center rounded-sm bg-accent text-accent-fg">{g && <GameIcon icon={g.theme.icon} className="size-3.5" />}</span>
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="eyebrow">{g?.shortName}</span>
                  {active && <Check className="size-4" aria-label="Current" />}
                </GameLink>
              </li>
            );
          })}
        </ul>
        {data.canCreateTeams && (
          <button
            type="button"
            onClick={() => { setOpen(false); openCreateTeam(); }}
            className="mt-1 flex w-full items-center gap-3 rounded-sm border-t border-line px-2 py-2.5 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <Plus className="size-4" aria-hidden="true" /> New game container
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
