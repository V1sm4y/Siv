'use client';
import { Button } from '@arena/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { CreateTeamDialog } from '@/components/shell/create-team-dialog';

export function NewTeamButton({ orgId, orgSlug, variant }: { orgId: string; orgSlug: string; variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant ?? 'primary'} onClick={() => setOpen(true)} data-testid="new-team">
        <Plus className="size-4" aria-hidden="true" /> New game container
      </Button>
      <CreateTeamDialog orgId={orgId} orgSlug={orgSlug} open={open} onOpenChange={setOpen} />
    </>
  );
}
