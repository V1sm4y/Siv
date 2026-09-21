import { cn } from '@arena/ui';
import { MarkGlyph } from './effects/liquid-mark';

/** Static wordmark (SSR-safe). The liquid version lives in the sidebar and login hero. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display text-[1.65rem] leading-none font-extrabold tracking-wide uppercase', className)}>
      <MarkGlyph className="size-7" />
      <span>
        Arena<span className="text-fg-subtle">&nbsp;OS</span>
      </span>
    </span>
  );
}
