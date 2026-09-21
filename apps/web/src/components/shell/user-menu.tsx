'use client';
import {
  Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger, useMotionStore, useThemeStore,
  type MotionPreference, type ThemePreference,
} from '@arena/ui';
import { LogOut } from 'lucide-react';
import { signOutAction } from '@/app/actions';
import type { ShellData } from './types';

export function UserMenu({ user }: { user: ShellData['user'] }) {
  const theme = useThemeStore();
  const motion = useMotionStore();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="user-menu" aria-label="Account menu" className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2">
          <Avatar name={user.name ?? user.email} src={user.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name ?? 'Unnamed'}</span>
            <span className="block truncate text-xs text-fg-muted">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme.preference} onValueChange={(v) => theme.setPreference(v as ThemePreference)}>
          {(['dark', 'light', 'system'] as const).map((v) => (
            <DropdownMenuRadioItem key={v} value={v} className="relative capitalize">{v}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Motion</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={motion.preference} onValueChange={(v) => motion.setPreference(v as MotionPreference)}>
          {([['system', 'Follow system'], ['full', 'Full motion'], ['reduced', 'Reduced motion']] as const).map(([v, label]) => (
            <DropdownMenuRadioItem key={v} value={v} className="relative">{label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg outline-none hover:bg-surface-3 focus-visible:bg-surface-3">
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
