'use client';
import {
  playCue, useCommandPaletteShortcut, useMotionStore, useSoundStore, useThemeStore, type PaletteGroup, type PaletteItem,
} from '@arena/ui';
import { Gauge, Home, MailPlus, Moon, Plus, ScrollText, Settings, Sun, Users, Volume2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameTransition } from './game-transition';
import { useShellActions } from './shell-actions';
import type { ShellData } from './types';

// cmdk + its dialog only load the first time the palette is opened (keeps ~100 KB off first load).
const CommandPalette = dynamic(() => import('@arena/ui/command-palette').then((m) => m.CommandPalette), { ssr: false });

const RECENT_KEY = 'arena.palette.recent';
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
};
const writeRecent = (ids: string[]) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 5))); } catch { /* ignore */ }
};

/** Command palette 2.0: actions, recents, fuzzy search (cmdk) and `g`-chords ("g m" → Members). */
export function Palette({ data }: { data: ShellData }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const { go } = useGameTransition();
  const { openCreateTeam } = useShellActions();
  const theme = useThemeStore();
  const motion = useMotionStore();
  const sound = useSoundStore();
  const toggle = useCallback(() => { playCue('tick'); setRecent(readRecent()); setLoaded(true); setOpen((o) => !o); }, []);
  useCommandPaletteShortcut(toggle);

  const base = `/app/${data.org.slug}`;
  const nav = useMemo(() => ({
    overview: () => router.push(base),
    members: () => router.push(`${base}/members`),
    audit: () => router.push(`${base}/audit`),
    settings: () => router.push(`${base}/settings`),
  }), [router, base]);

  // g-chords: g o / g m / g a / g s. Ignored while typing in a field or when modifiers are held.
  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout>;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (e.key === '?') { toggle(); return; }
      if (!armed) {
        if (e.key === 'g') { armed = true; timer = setTimeout(() => (armed = false), 900); }
        return;
      }
      armed = false;
      clearTimeout(timer);
      const target = { o: nav.overview, m: data.canManage ? nav.members : undefined, a: data.canReadAudit ? nav.audit : undefined, s: nav.settings }[e.key];
      if (target) { e.preventDefault(); playCue('tick'); target(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [nav, data.canManage, data.canReadAudit, toggle]);

  const all = useMemo<PaletteItem[]>(() => [
    { id: 'nav-overview', label: 'Overview', hint: 'g o', icon: <Home className="size-4" />, onSelect: nav.overview },
    ...(data.canManage ? [{ id: 'nav-members', label: 'Members', hint: 'g m', icon: <Users className="size-4" />, onSelect: nav.members }] : []),
    ...(data.canReadAudit ? [{ id: 'nav-audit', label: 'Audit log', hint: 'g a', icon: <ScrollText className="size-4" />, onSelect: nav.audit }] : []),
    { id: 'nav-settings', label: 'Settings', hint: 'g s', icon: <Settings className="size-4" />, onSelect: nav.settings },
    ...(data.canManage ? [{ id: 'act-invite', label: 'Invite someone…', keywords: ['add', 'member', 'email'], icon: <MailPlus className="size-4" />, onSelect: () => router.push(`${base}/members?invite=1`) }] : []),
    ...(data.canCreateTeams ? [{ id: 'act-team', label: 'New game container…', keywords: ['team', 'game', 'add'], icon: <Plus className="size-4" />, onSelect: openCreateTeam }] : []),
    ...data.teams.map((t) => ({ id: `team-${t.id}`, label: `Switch to ${t.name}`, hint: t.gameId, keywords: [t.gameId, 'game', 'team', 'container'], onSelect: () => go(`${base}/t/${t.slug}`, t.gameId) })),
    { id: 'pref-dark', label: 'Dark theme', icon: <Moon className="size-4" />, onSelect: () => theme.setPreference('dark') },
    { id: 'pref-light', label: 'Light theme', icon: <Sun className="size-4" />, onSelect: () => theme.setPreference('light') },
    { id: 'pref-reduced', label: 'Reduce motion', icon: <Gauge className="size-4" />, onSelect: () => motion.setPreference('reduced') },
    { id: 'pref-full', label: 'Full motion', icon: <Gauge className="size-4" />, onSelect: () => motion.setPreference('full') },
    { id: 'pref-sound', label: sound.enabled ? 'Turn interface sounds off' : 'Turn interface sounds on', icon: <Volume2 className="size-4" />, onSelect: () => sound.setEnabled(!sound.enabled) },
  ], [data, nav, router, base, go, openCreateTeam, theme, motion, sound]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const track = (i: PaletteItem): PaletteItem => ({ ...i, onSelect: () => { writeRecent([i.id, ...readRecent().filter((r) => r !== i.id)]); i.onSelect(); } });
    const byId = new Map(all.map((i) => [i.id, i]));
    const recents = recent.map((id) => byId.get(id)).filter((i): i is PaletteItem => Boolean(i));
    const pick = (prefix: string) => all.filter((i) => i.id.startsWith(prefix)).map(track);
    return [
      { heading: 'Recent', items: recents.map((i) => ({ ...track(i), id: `recent-${i.id}` })) },
      { heading: 'Actions', items: pick('act-') },
      { heading: 'Navigate', items: pick('nav-') },
      { heading: 'Switch container', items: pick('team-') },
      { heading: 'Preferences', items: pick('pref-') },
    ].filter((g) => g.items.length > 0);
  }, [all, recent]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        data-testid="palette-trigger"
        className="hidden items-center gap-2 rounded-sm border border-line-strong bg-surface-1/70 px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:flex"
      >
        Search or jump to… <kbd className="eyebrow ml-6 rounded-sm border border-line-strong px-1.5 py-0.5">⌘K</kbd>
      </button>
      {(open || loaded) && <CommandPalette open={open} onOpenChange={setOpen} groups={groups} />}
    </>
  );
}
