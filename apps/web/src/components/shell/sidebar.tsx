'use client';
import { DemoBadge, cn } from '@arena/ui';
import { motion } from 'framer-motion';
import { Home, ScrollText, Settings, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '../wordmark';
import { GameLink } from './game-link';
import { GameSwitcher } from './game-switcher';
import type { ShellData, ShellTeam } from './types';
import { UserMenu } from './user-menu';
import { getGame } from '@arena/game-registry';

interface NavItem { href: string; label: string; icon: LucideIcon; show: boolean; gameId?: string | null; testId: string }

export function SidebarContent({ data, current, instance, onNavigate }: { data: ShellData; current: ShellTeam | undefined; instance: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/app/${data.org.slug}`;
  const game = current ? getGame(current.gameId) : null;
  const items: NavItem[] = [
    { href: base, label: 'Overview', icon: Home, show: true, testId: 'nav-overview' },
    ...(current && game ? [{ href: `${base}/t/${current.slug}`, label: current.name, icon: Home, show: true, gameId: current.gameId, testId: 'nav-team' }] : []),
    { href: `${base}/members`, label: 'Members', icon: Users, show: data.canManage, testId: 'nav-members' },
    { href: `${base}/audit`, label: 'Audit log', icon: ScrollText, show: data.canReadAudit, testId: 'nav-audit' },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, show: true, testId: 'nav-settings' },
  ];
  // The team entry replaces nothing; drop the icon duplication by giving it the game's icon in the switcher only.
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between px-1 pt-1">
        <Wordmark />
      </div>
      <div className="px-1">
        <p className="truncate text-xs font-medium text-fg-muted" title={data.org.name}>{data.org.name}</p>
        {data.org.isDemo && <DemoBadge className="mt-1.5" />}
      </div>
      <GameSwitcher data={data} current={current} />
      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {items.filter((i) => i.show).map((item) => {
          const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
          const Icon = item.icon;
          const cls = cn(
            'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            active ? 'text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
          );
          const inner = (
            <>
              {active && (
                <motion.span
                  layoutId={`nav-pill-${instance}`}
                  className="absolute inset-0 rounded-md bg-surface-3"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
              <Icon className="relative size-4" aria-hidden="true" />
              <span className="relative truncate">{item.label}</span>
            </>
          );
          return item.gameId ? (
            <GameLink key={item.href} href={item.href} gameId={item.gameId} aria-current={active ? 'page' : undefined} data-testid={item.testId} className={cls} onNavigate={onNavigate}>
              {inner}
            </GameLink>
          ) : (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} data-testid={item.testId} className={cls} onClick={onNavigate}>
              {inner}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line pt-3">
        <UserMenu user={data.user} />
      </div>
    </div>
  );
}
