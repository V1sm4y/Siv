import type { ComponentProps } from 'react';
import { cn } from '../cn';

/** Compose to mirror the final layout; the shimmer is opacity-only and disabled under reduced motion. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-[shimmer_1.6s_ease-in-out_infinite] rounded-md bg-surface-3', className)}
      {...props}
    />
  );
}
