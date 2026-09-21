import { cn } from '@arena/ui';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 9l7 4v6l-7 4-7-4v-6z" fill="var(--accent)" />
      </svg>
      <span>
        ARENA<span className="text-fg-subtle"> OS</span>
      </span>
    </span>
  );
}
