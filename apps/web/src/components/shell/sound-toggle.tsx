'use client';
import { Tooltip, useSoundStore } from '@arena/ui';
import { Volume2, VolumeX } from 'lucide-react';

export function SoundToggle() {
  const { enabled, setEnabled } = useSoundStore();
  return (
    <Tooltip label={enabled ? 'Sound on' : 'Sound off'}>
      <button
        type="button"
        aria-pressed={enabled}
        aria-label="Interface sounds"
        data-testid="sound-toggle"
        onClick={() => setEnabled(!enabled)}
        className="grid size-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        {enabled ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
