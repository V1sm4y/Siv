'use client';
import { CommandPalette, useCommandPaletteShortcut, useMotionStore, useThemeStore, type PaletteGroup } from '@arena/ui';
import { Moon, Sun, Gauge, Home, ScrollText, Settings, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useGameTransition } from './game-transition';
import type { ShellData } from './types';

export function Palette({ data }: { data: ShellData }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { go } = useGameTransition();
  const theme = useThemeStore();
  const motion = useMotionStore();
  const toggle = useCallback(() => setOpen((o) => !o), []);
  useCommandPaletteShortcut(toggle);

  const groups = useMemo<PaletteGroup[]>(() => {
    const base = `/app/${data.org.slug}`;
    return [
      {
        heading: 'Navigate',
        items: [
          { id: 'overview', label: 'Overview', icon: <Home className="size-4" />, onSelect: () => router.push(base) },
          ...(data.canManage ? [{ id: 'members', label: 'Members', icon: <Users className="size-4" />, onSelect: () => router.push(`${base}/members`) }] : []),
          ...(data.canReadAudit ? [{ id: 'audit', label: 'Audit log', icon: <ScrollText className="size-4" />, onSelect: () => router.push(`${base}/audit`) }] : []),
          { id: 'settings', label: 'Settings', icon: <Settings className="size-4" />, onSelect: () => router.push(`${base}/settings`) },
        ],
      },
      {
        heading: 'Switch team',
        items: data.teams.map((t) => ({ id: `team-${t.id}`, label: t.name, hint: t.gameId, keywords: [t.gameId, 'game', 'team'], onSelect: () => go(`${base}/t/${t.slug}`, t.gameId) })),
      },
      {
        heading: 'Preferences',
        items: [
          { id: 'theme-dark', label: 'Dark theme', icon: <Moon className="size-4" />, onSelect: () => theme.setPreference('dark') },
          { id: 'theme-light', label: 'Light theme', icon: <Sun className="size-4" />, onSelect: () => theme.setPreference('light') },
          { id: 'motion-reduced', label: 'Reduce motion', icon: <Gauge className="size-4" />, onSelect: () => motion.setPreference('reduced') },
          { id: 'motion-full', label: 'Full motion', icon: <Gauge className="size-4" />, onSelect: () => motion.setPreference('full') },
        ],
      },
    ].filter((g) => g.items.length > 0);
  }, [data, router, go, theme, motion]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        data-testid="palette-trigger"
        className="hidden items-center gap-2 rounded-md border border-line-strong bg-surface-1 px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:flex"
      >
        Search or jump to… <kbd className="ml-6 rounded border border-line-strong px-1.5 text-xs text-fg-subtle">⌘K</kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} groups={groups} />
    </>
  );
}
