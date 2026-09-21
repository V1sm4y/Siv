'use client';
import { Button, Dialog, DialogContent, Field, GameIcon, Input, cn } from '@arena/ui';
import { games, getGame } from '@arena/game-registry';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useGameTransition } from './game-transition';

export function CreateTeamDialog({ orgId, orgSlug, open, onOpenChange }: { orgId: string; orgSlug: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { go } = useGameTransition();
  const [gameId, setGameId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const game = gameId ? getGame(gameId) : null;
  const m = useMutation({
    mutationFn: () => api<{ slug: string }>(`/api/orgs/${orgId}/teams`, { body: { name: name || `${game?.shortName} Team`, gameId } }),
    onSuccess: (t) => {
      onOpenChange(false);
      router.refresh();
      go(`/app/${orgSlug}/t/${t.slug}`, gameId);
    },
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New game container" description="Each game has its own roster, calendar and theme under your organisation.">
        <form onSubmit={(e) => { e.preventDefault(); if (gameId) m.mutate(); }} className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Game" className="grid grid-cols-2 gap-2">
            {games.map((g): ReactNode => {
              const on = g.id === gameId;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-game={g.id}
                  onClick={() => setGameId(g.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                    on ? 'border-accent bg-accent/10' : 'border-line-strong hover:bg-surface-2',
                  )}
                >
                  <span className={cn('grid size-7 place-items-center rounded-md', on ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-accent-text')}>
                    <GameIcon icon={g.theme.icon} className="size-4" />
                  </span>
                  {g.name}
                </button>
              );
            })}
          </div>
          {game && (
            <Field label="Team name" error={err?.field('name')}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${game.shortName} Team`} />}
            </Field>
          )}
          {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
          <Button type="submit" disabled={!gameId} loading={m.isPending}>Create container</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
