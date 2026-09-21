'use client';
import { Button } from '@arena/ui';
import { Plus } from 'lucide-react';
import { useShellActions } from '@/components/shell/shell-actions';

export function NewTeamButton({ variant }: { variant?: 'primary' | 'secondary' }) {
  const { openCreateTeam } = useShellActions();
  return (
    <Button variant={variant ?? 'primary'} onClick={openCreateTeam} data-testid="new-team">
      <Plus className="size-4" aria-hidden="true" /> New game container
    </Button>
  );
}
