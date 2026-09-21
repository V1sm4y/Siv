'use client';
import { DemoBadge, cn, playCue } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { motion } from 'framer-motion';
import { Home, ScrollText, Settings, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { brandTheme } from '@arena/ui';
import { LiquidMark } from '../effects/liquid-mark';
import { GameLink } from './game-link';
import { GameSwitcher } from './game-switcher';
import type { ShellData, ShellTeam } from './types';
import { UserMenu } from './user-menu';

interface NavItem { href: string; label: string; icon: LucideIcon; show: boolean; gameId?: string | null; testId: string }

export function SidebarContent({ data, current, instance, onNavigate }: { data: ShellData; current: ShellTeam | undefined; instance: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `/app/${data.org.slug}`;
  const game = current ? getGame(current.gameId) : null;
  const tint = game?.theme.accent ?? brandTheme.accent;
  const items: NavItem[] = [
    { href: base, label: 'Overview', icon: Home, show: true, testId: 'nav-overview' },
    ...(current && game ? [{ href: `${base}/t/${current.slug}`, label: current.name, icon: Home, show: true, gameId: current.gameId, testId: 'nav-team' }] : []),
    { href: `${base}/members`, label: 'Members', icon: Users, show: data.canManage, testId: 'nav-members' },
    { href: `${base}/audit`, label: 'Audit log', icon: ScrollText, show: data.canReadAudit, testId: 'nav-audit' },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, show: true, testId: 'nav-settings' },
  ];
  return (
    <div className="flex h-full flex-col gap-7 p-4">
      <div className="flex items-center gap-3 pt-1">
        {/* SVG at rest; the WebGL liquid mark loads on first hover (keeps three.js off first load). */}
        <LiquidMark size={36} tint={tint} activate="hover" />
        <span className="font-display text-[1.65rem] leading-none font-extrabold tracking-wide uppercase">
          Arena<span className="text-fg-subtle">&nbsp;OS</span>
        </span>
      </div>

      <div>
        <p className="eyebrow">Organisation</p>
        <p className="mt-1.5 truncate font-medium" title={data.org.name}>{data.org.name}</p>
        {data.org.isDemo && <DemoBadge className="mt-2" />}
      </div>

      <div>
        <p className="eyebrow mb-2">Container</p>
        <GameSwitcher data={data} current={current} />
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        <p className="eyebrow mb-2">Workspace</p>
        {items.filter((i) => i.show).map((item) => {
          const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
          const Icon = item.icon;
          const cls = cn(
            'relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
            active ? 'text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
          );
          const inner = (
            <>
              {active && (
                <motion.span layoutId={`nav-pill-${instance}`} className="absolute inset-0 rounded-sm bg-surface-2" transition={{ type: 'spring', stiffness: 520, damping: 42 }} />
              )}
              {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
              <Icon className="relative size-4" aria-hidden="true" />
              <span className="relative truncate">{item.label}</span>
            </>
          );
          const nav = () => { playCue('tick'); onNavigate?.(); };
          return item.gameId ? (
            <GameLink key={item.href} href={item.href} gameId={item.gameId} aria-current={active ? 'page' : undefined} data-testid={item.testId} className={cls} onNavigate={onNavigate}>
              {inner}
            </GameLink>
          ) : (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} data-testid={item.testId} className={cls} onClick={nav}>
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
