import { Badge } from '@arena/ui';
import type { ReactNode } from 'react';

/**
 * Edge-to-edge hero zone for a game container. CSS only (no WebGL: this page carries data, see D-41):
 * a huge faint glyph as cover art, an accent wash, and the title set as a broadcast lower-third.
 */
export function TeamHero({ title, eyebrow, note, icon, badges }: { title: string; eyebrow: string; note: string; icon: ReactNode; badges: string[] }) {
  return (
    <header className="relative -mx-5 mb-10 overflow-hidden border-b border-line px-5 pt-6 pb-10 sm:-mx-10 sm:px-10 sm:pt-10 sm:pb-14">
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-16 size-[30rem] text-accent opacity-[0.09] sm:size-[36rem]">{icon}</div>
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <p className="eyebrow text-accent-text">{eyebrow}</p>
      <h1 className="title mt-4 text-6xl sm:text-8xl" data-testid="team-title">{title}</h1>
      <p className="mt-5 max-w-xl text-fg-muted text-pretty">{note}</p>
      <div className="mt-5 flex flex-wrap gap-2">{badges.map((b) => <Badge key={b}>{b}</Badge>)}</div>
    </header>
  );
}
