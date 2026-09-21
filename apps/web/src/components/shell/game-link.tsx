'use client';
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { useGameTransition } from './game-transition';

/** A link into a game container. Keeps a real href (open in new tab, copy link) but plays the themed transition on plain clicks. */
export function GameLink({ href, gameId, onNavigate, ...props }: ComponentProps<typeof Link> & { gameId: string | null; href: string; onNavigate?: () => void }) {
  const { go } = useGameTransition();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.();
        go(href, gameId, { x: e.clientX, y: e.clientY });
      }}
    />
  );
}
