'use client';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useEffect, type ReactNode } from 'react';

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string[];
  onSelect: () => void;
}
export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

/** Cmd/Ctrl+K toggles the palette from anywhere. */
export function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: PaletteGroup[];
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-[overlay-in_140ms_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className="glass fixed top-[18vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl data-[state=open]:animate-[pop-in_180ms_var(--ease-out)]"
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-fg-muted" aria-hidden="true" />
              <Command.Input
                placeholder="Search or jump to…"
                className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <kbd className="rounded border border-line-strong px-1.5 text-xs text-fg-subtle">esc</kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-muted">No results.</Command.Empty>
              {groups.map((g) => (
                <Command.Group
                  key={g.heading}
                  heading={g.heading}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-subtle"
                >
                  {g.items.map((i) => (
                    <Command.Item
                      key={i.id}
                      value={`${i.label} ${i.keywords?.join(' ') ?? ''}`}
                      onSelect={() => {
                        onOpenChange(false);
                        i.onSelect();
                      }}
                      className="flex cursor-default items-center gap-3 rounded-md px-3 py-2.5 text-sm text-fg data-[selected=true]:bg-surface-3"
                    >
                      <span className="text-fg-muted" aria-hidden="true">{i.icon}</span>
                      <span className="flex-1">{i.label}</span>
                      {i.hint && <span className="text-xs text-fg-subtle">{i.hint}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
