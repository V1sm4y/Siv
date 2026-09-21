import { Avatar as A } from 'radix-ui';
import { cn } from '../cn';

const initials = (name?: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

export function Avatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
  return (
    <A.Root
      className={cn('inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-3 text-xs font-semibold text-fg', className)}
    >
      {src && <A.Image src={src} alt="" className="size-full object-cover" />}
      <A.Fallback aria-label={name ?? 'Unknown user'}>{initials(name)}</A.Fallback>
    </A.Root>
  );
}
