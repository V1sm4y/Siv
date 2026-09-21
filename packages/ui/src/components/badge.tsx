import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn';

const badge = cva('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-line-strong text-fg-muted',
      accent: 'border-accent/50 bg-accent/10 text-accent-text',
      success: 'border-success/50 bg-success/10 text-success',
      warning: 'border-warning/50 bg-warning/10 text-warning',
      danger: 'border-danger/50 bg-danger/10 text-danger',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Always carries a text label: status is never conveyed by colour alone. */
export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

/** Persistent label for seeded demo data. Never rendered for real orgs. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={cn('uppercase tracking-wider', className)} title="This organisation contains seeded demo data">
      <span aria-hidden="true">◆</span> Demo data
    </Badge>
  );
}
